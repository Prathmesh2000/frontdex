import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listProjectFiles, updateProjectFiles } from './files.js';
import { createResolver } from './resolve.js';
import { I18N_LIBS } from './analyzers/i18n.js';
import { cachedLister, codeownersMatcher, testsAndStories } from './analyzers/ownership.js';
import { heavyImports } from './analyzers/perf.js';
import { readStories } from './analyzers/stories.js';
import { collectEndpoints } from './endpoints.js';
import { joinRoute, routePath } from './parse-file.js';
import { fileSystemRoutes } from './routers.js';
import { workspaceOf } from './workspace.js';
import { loadMany, loadOne, MAP_FIELDS } from './parse-pool.js';
import { buildProjectInsights } from './project.js';

const PKG = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const PAGE_FILE = /^page\.(tsx|jsx|ts|js)$/;

// Any change to the scanner's own code invalidates cached parse results.
const SCANNER_HASH = createHash('sha1')
  .update(fs.readdirSync(new URL('.', import.meta.url), { recursive: true }).filter((f) => /\.js$/.test(f)).sort().map((f) => fs.readFileSync(new URL(f.split(path.sep).join('/'), import.meta.url), 'utf8')).join('\0'))
  .digest('hex')
  .slice(0, 12);
export const CACHE_VERSION = `${PKG.version}/${SCANNER_HASH}`;

// Linking and insights mutate component records: they assign ids, resolve schemas into `validation`, add and tag store
// reads/writes, and push issues. Only those parts are copied, so the cache stays pristine without a deep clone of every
// component per scan (props, JSX and hooks are large and only read). The session-rescan test guards this list.
const cloneMutable = (c) => ({
  ...c,
  ...(c.validation && { validation: c.validation.map((v) => ({ ...v })) }),
  ...(c.store && { store: { reads: c.store.reads.map((r) => ({ ...r })), writes: c.store.writes.map((w) => ({ ...w })) } }),
  ...(c.issues && { issues: c.issues.map((i) => ({ ...i })) }),
});
const deserialize = (data, file) => ({ ...data, components: data.components.map(cloneMutable), file, ...Object.fromEntries(MAP_FIELDS.map((k) => [k, new Map(data[k])])) });

/**
 * Parses every source file, reusing cached parse results for files whose mtime/size or content hash is unchanged.
 * Linking (imports, renders, pages) always runs over the full module set because it is cheap and cross-file.
 * `known = { files, changed, resolver }` is the watcher fast path: `files` and `resolver` come from the previous result
 * and `changed` lists the absolute paths reported since, so unchanged files skip the directory walk and the stat.
 * The reused resolver does not see tsconfig edits; the watcher ignores .json files, so restart it after changing paths.
 * `previous` is the last catalogue: components and hooks keep the IDs they had in it (see assignIds).
 */
export function scanProject(config, { cache, known, previous } = {}) {
  const root = config.root;
  // Called for every file many times per scan (ids, pages, issues); path.relative is slow enough to show in profiles.
  const relCache = new Map();
  const rel = (f) => relCache.get(f) ?? relCache.set(f, path.relative(root, f).split(path.sep).join('/')).get(f);
  const modules = new Map();
  const warnings = [];
  const prevFiles = cache?.version === CACHE_VERSION ? cache.files : {};
  const nextFiles = {};
  const delta = { added: [], changed: [], removed: [], reused: 0, parsed: 0 };

  // With `known` (a watcher session), only the paths it reports are re-listed and re-stat'ed; everything else is trusted from the cache.
  const timings = {};
  let mark = performance.now();
  // Stage durations in ms, returned as result.timings (printed by bench/scan.js).
  const lap = (stage) => {
    const now = performance.now();
    timings[stage] = Math.round(now - mark);
    mark = now;
  };
  const projectFiles = known ? updateProjectFiles(config, known.files, known.changed) : listProjectFiles(config);
  const touched = known && new Set(known.changed);
  // Import resolution stats candidate paths, so a session reuses its resolver (and its cache) while no file was added or removed.
  const sameFiles = known && sameList(projectFiles.sources, known.files.sources) && sameList(projectFiles.styles, known.files.styles);
  const resolveImport = (sameFiles && known.resolver) || createResolver(root, { workspaces: config.workspaces });
  lap('list');
  // Pass 1: keep cached parses whose mtime/size still match; queue the rest for reading.
  const pending = [];
  const slots = projectFiles.sources.map((file) => {
    const key = rel(file);
    const prev = prevFiles[key];
    const stat = touched && prev && !touched.has(file) ? null : fs.statSync(file);
    if (prev && (!stat || (prev.mtimeMs === stat.mtimeMs && prev.size === stat.size))) return { file, key, prev, entry: prev };
    const slot = { file, key, prev, stat };
    pending.push(slot);
    return slot;
  });

  lap('stat');
  // Pass 2: read, hash and parse the queue (across worker threads when it is large, e.g. a cold scan).
  loadMany(pending.map((s) => [s.file, s.prev?.hash])).forEach(({ hash, mod: parsed }, i) => {
    const { key, prev, stat } = pending[i];
    if (!parsed) return void (pending[i].entry = { ...prev, mtimeMs: stat.mtimeMs, size: stat.size });
    delta.parsed++;
    if (parsed.error && prev?.mod && !prev.mod.error) {
      // Keep the last good parse while the file is broken mid-edit, so components don't flicker out of the catalogue and history.
      pending[i].entry = { ...prev, mtimeMs: stat.mtimeMs, size: stat.size, hash };
      warnings.push(`${key}: ${parsed.error} (kept last good version)`);
    } else {
      pending[i].entry = { mtimeMs: stat.mtimeMs, size: stat.size, hash, mod: parsed };
      delta[prev ? 'changed' : 'added'].push(key);
    }
  });

  lap('parse');
  for (const { file, key, prev, entry } of slots) {
    if (entry.mod === prev?.mod) delta.reused++;
    nextFiles[key] = entry;
    const mod = deserialize(entry.mod, file);
    if (mod.error) warnings.push(`${key}: ${mod.error}`);
    modules.set(file, mod);
  }
  delta.removed = Object.keys(prevFiles).filter((k) => !nextFiles[k]);

  lap('load');
  const entries = [...modules.values()].flatMap((mod) => mod.components.map((c) => ({ mod, c })));
  const aliases = { ...previous?.aliases };
  const componentIds = assignIds(entries.map(({ mod, c }) => ({ name: c.name, file: rel(mod.file) })), previous?.components, aliases);
  const localIndex = new Map();
  for (const [i, { mod, c }] of entries.entries()) {
    c.id = componentIds[i];
    if (!localIndex.has(mod.file)) localIndex.set(mod.file, new Map());
    localIndex.get(mod.file).set(c.name, c);
  }

  const resolveExport = (file, exported, seen = new Set()) => {
    const key = `${file}#${exported}`;
    const mod = modules.get(file);
    if (!mod || seen.has(key)) return null;
    seen.add(key);
    const local = mod.exports.get(exported);
    if (local) return resolveLocal(file, local, seen);
    for (const r of mod.reexports) {
      if (r.exported !== exported) continue;
      const target = resolveImport(file, r.source);
      return target ? resolveExport(target, r.imported, seen) : null;
    }
    if (exported === 'default') return null;
    for (const source of mod.exportAll) {
      const target = resolveImport(file, source);
      const found = target && resolveExport(target, exported, seen);
      if (found) return found;
    }
    return null;
  };

  /** Compound components: `<Tabs.List>` where Tabs.List was assigned in the file that defines Tabs (possibly behind imports/barrels). */
  const resolveMember = (file, head, member, seen) => {
    const key = `${file}#${head}.${member}`;
    const mod = modules.get(file);
    if (!mod || seen.has(key)) return null;
    seen.add(key);
    const direct = mod.aliases.get(`${head}.${member}`);
    if (direct) return resolveLocal(file, direct, seen);
    const base = followAlias(mod, head);
    if (base !== head && mod.aliases.has(`${base}.${member}`)) return resolveLocal(file, mod.aliases.get(`${base}.${member}`), seen);
    const imp = mod.imports.get(head);
    if (!imp || imp.imported === '*') return null;
    const target = resolveImport(file, imp.source);
    return target ? resolveExportedMember(target, imp.imported, member, seen) : null;
  };
  const resolveExportedMember = (file, exported, member, seen) => {
    const mod = modules.get(file);
    if (!mod) return null;
    const local = mod.exports.get(exported);
    if (local) return resolveMember(file, local, member, seen);
    for (const r of mod.reexports) {
      if (r.exported !== exported) continue;
      const target = resolveImport(file, r.source);
      return target ? resolveExportedMember(target, r.imported, member, seen) : null;
    }
    if (exported === 'default') return null;
    for (const source of mod.exportAll) {
      const target = resolveImport(file, source);
      const found = target && resolveExportedMember(target, exported, member, seen);
      if (found) return found;
    }
    return null;
  };

  const resolveLocal = (file, local, seen = new Set()) => {
    const mod = modules.get(file);
    if (!mod) return null;
    const [head, member] = local.split('.');
    if (member) {
      const compound = resolveMember(file, head, member, seen);
      if (compound) return compound;
    }
    const comp = !member && localIndex.get(file)?.get(head);
    if (comp) return comp;
    const alias = !member && mod.aliases.get(head);
    if (alias && alias !== head) return resolveLocal(file, alias, seen);
    const imp = mod.imports.get(head);
    if (!imp) return null;
    if (member && imp.imported !== '*') return null;
    const target = resolveImport(file, imp.source);
    const exported = member ?? imp.imported;
    if (target) return modules.has(target) ? resolveExport(target, exported, seen) : null;
    if (imp.source.startsWith('.')) return null;
    return { external: `${imp.source}#${exported === 'default' || exported === '*' ? head : exported}` };
  };

  /** Value of a constant reference such as ROUTES.HOME.LIST in `file`, following imports (route path constants). */
  const constValue = (file, ref, depth = 0) => {
    const mod = modules.get(file);
    if (!mod || depth > 4) return undefined;
    const [head, ...rest] = ref.split('.');
    let value = mod.consts?.[head];
    if (value === undefined) {
      const imp = mod.imports.get(head);
      const target = imp && resolveImport(file, imp.source);
      const tmod = target && modules.get(target);
      if (!tmod) return undefined;
      if (imp.imported === '*') return rest.length ? constValue(target, rest.join('.'), depth + 1) : undefined;
      const local = tmod.exports.get(imp.imported) ?? imp.imported;
      return constValue(target, [local, ...rest].join('.'), depth + 1);
    }
    for (const key of rest) value = value?.[key];
    return value;
  };

  const findExportedHook = (file, exported, depth) => {
    const mod = modules.get(file);
    if (!mod || depth > 6) return null;
    const local = mod.exports.get(exported) ?? (exported !== 'default' ? exported : null);
    if (local && mod.customHooks?.[local]) return { file, facts: mod.customHooks[local] };
    for (const r of mod.reexports) {
      if (r.exported !== exported) continue;
      const target = resolveImport(file, r.source);
      return target ? findExportedHook(target, r.imported, depth + 1) : null;
    }
    for (const source of mod.exportAll) {
      const target = resolveImport(file, source);
      const found = target && findExportedHook(target, exported, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const findHook = (file, name) => {
    const mod = modules.get(file);
    if (!mod) return null;
    if (mod.customHooks?.[name]) return { file, facts: mod.customHooks[name] };
    const imp = mod.imports.get(name);
    const target = imp && resolveImport(file, imp.source);
    return target ? findExportedHook(target, imp.imported, 0) : null;
  };
  /** Reads performed by a custom hook, following hooks it calls in turn. */
  const hookReads = (file, name, seen = new Set()) => {
    const found = findHook(file, name);
    if (!found || seen.has(`${found.file}#${name}`)) return [];
    seen.add(`${found.file}#${name}`);
    return [...found.facts.reads, ...found.facts.calls.flatMap((h) => hookReads(found.file, h, seen))];
  };

  const resolveSchema = (file, local) => {
    const imp = modules.get(file)?.imports.get(local);
    const target = imp && resolveImport(file, imp.source);
    const tmod = target && modules.get(target);
    const name = tmod && (tmod.exports.get(imp.imported) ?? imp.imported);
    return name && tmod.schemas?.[name] ? { ...tmod.schemas[name], file: rel(target) } : null;
  };

  const byTag = new Map(entries.filter(({ c }) => c.tag).map(({ c }) => [c.tag, c]));
  /**
   * The catalogue record of one component before project-wide passes (usedBy, pages, insights) fill in the rest:
   * resolves its schemas, custom-hook reads and JSX children. Watch sessions call it again via patchProject().
   */
  const linkComponent = (mod, c) => {
    for (const v of c.validation ?? []) {
      if (v.via !== 'schema') continue;
      const schema = resolveSchema(mod.file, v.schema);
      if (schema) Object.assign(v, { via: schema.lib, rules: schema.fields });
    }
    for (const h of c.hooks ?? []) {
      if (h.category !== 'custom') continue;
      const reads = hookReads(mod.file, h.name);
      if (!reads.length) continue;
      c.store ??= { reads: [], writes: [] };
      for (const r of reads) {
        if (!c.store.reads.some((x) => x.kind === r.kind && x.store === r.store && x.path === r.path)) c.store.reads.push({ via: h.name, ...r });
      }
    }
    const renders = new Set();
    const externals = new Set();
    const passes = {};
    for (const j of c.jsx) {
      // Custom element tags (<x-card>) are global once defined, so they resolve by tag rather than by import.
      const r = resolveLocal(mod.file, j.name) ?? (j.name.includes('-') ? byTag.get(j.name) : null);
      if (r?.id && r.id !== c.id) {
        renders.add(r.id);
        if (j.props?.length && !j.soft) (passes[r.id] ??= []).push(...j.props.map((p) => ({ ...p, line: j.line })));
      } else if (r?.external && !j.soft) externals.add(r.external);
    }
    const exportNames = [...mod.exports].filter(([, local]) => followAlias(mod, local) === c.name).map(([e]) => e);
    return compact({
      name: c.name,
      file: rel(mod.file),
      workspace: workspaceOf(config.workspaces, mod.file)?.name,
      line: c.line,
      kind: c.kind,
      tag: c.tag,
      element: c.element,
      export: exportNames.includes('default') ? 'default' : exportNames.length ? 'named' : 'none',
      description: c.description,
      status: c.status,
      props: c.props,
      state: c.state,
      context: c.context,
      refs: c.refs,
      hooks: c.hooks,
      lifecycle: c.lifecycle,
      variables: c.variables,
      functions: c.functions,
      timers: c.timers,
      apiCalls: c.apiCalls,
      store: c.store?.reads.length || c.store?.writes.length ? c.store : undefined,
      validation: c.validation,
      styles: c.styles,
      issues: c.issues,
      renders: [...renders],
      passes,
      externals: [...externals],
      usedBy: [],
      pages: [],
    });
  };
  const components = {};
  for (const { mod, c } of entries) components[c.id] = linkComponent(mod, c);
  for (const [id, comp] of Object.entries(components)) {
    for (const child of comp.renders ?? []) (components[child].usedBy ??= []).push(id);
  }

  const pages = {};
  const addPage = (route, page) => {
    const workspace = workspaceOf(config.workspaces, path.join(root, page.file))?.name;
    if (workspace) page.workspace = workspace;
    // Two apps in a monorepo may both have `/`; the second is keyed by its workspace (or by router within one app).
    let key = pages[route] ? `${route} (${workspace && workspace !== pages[route].workspace ? workspace : page.router})` : route;
    // A third declaration of the same route (say a catch-all in a nested <Routes>) must not overwrite the second.
    if (pages[key]) key = `${route} (${page.file})`;
    pages[key] = page;
  };
  const idOf = (r) => r?.id;
  // A path that is nothing but an unresolved expression ({route.path}) says nothing about the app: skip it.
  const addRoutePage = (route, p) => {
    if (/^\/\{[^}]*\}$/.test(route)) return;
    addPage(route, { router: p.router, file: p.file, component: p.component, params: [...route.matchAll(/:(\w+)/g)].map((m) => m[1]), layouts: p.layouts, wrappers: p.wrappers, alternates: p.alternates, extras: p.extras });
  };

  // Next.js app roots: the project root when it is a Next app, plus every workspace package that depends on next.
  const nextRoots = [
    ...(config.rootFramework === 'next' || (config.framework === 'next' && !config.workspaces.length) ? [root] : []),
    ...config.workspaces.filter((w) => w.framework === 'next').map((w) => w.dir),
  ];
  const nextDirs = (names) => nextRoots.flatMap((r) => names.map((d) => path.join(r, d))).filter(isDir);

  for (const dir of nextDirs(['app', 'src/app'])) {
    for (const file of modules.keys()) {
      if (!file.startsWith(dir + path.sep) || !PAGE_FILE.test(path.basename(file))) continue;
      const segments = path.relative(dir, path.dirname(file)).split(path.sep).filter(Boolean);
      const layouts = [];
      for (let i = 0; i <= segments.length; i++) {
        const layoutDir = path.join(dir, ...segments.slice(0, i));
        const layoutFile = [...modules.keys()].find((f) => path.dirname(f) === layoutDir && /^layout\./.test(path.basename(f)));
        const id = layoutFile && idOf(resolveExport(layoutFile, 'default'));
        if (id) layouts.push(id);
      }
      const routeSegs = segments.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
      const pageExports = modules.get(file).exports;
      addPage('/' + routeSegs.join('/'), {
        router: 'next-app',
        file: rel(file),
        component: idOf(resolveExport(file, 'default')),
        params: paramsOf(routeSegs),
        layouts,
        metadata: pageExports.has('generateMetadata') ? 'dynamic' : pageExports.has('metadata') ? 'static' : undefined,
      });
    }
  }

  for (const dir of nextDirs(['pages', 'src/pages'])) {
    const appFile = [...modules.keys()].find((f) => path.dirname(f) === dir && /^_app\./.test(path.basename(f)));
    const appId = appFile && idOf(resolveExport(appFile, 'default'));
    for (const file of modules.keys()) {
      if (!file.startsWith(dir + path.sep)) continue;
      const relPath = path.relative(dir, file).split(path.sep);
      if (relPath[0] === 'api' || relPath.some((s) => s.startsWith('_'))) continue;
      const segs = relPath.map((s, i) => (i === relPath.length - 1 ? s.replace(/\.[^.]+$/, '') : s)).filter((s) => s !== 'index');
      addPage('/' + segs.join('/'), {
        router: 'next-pages',
        file: rel(file),
        component: idOf(resolveExport(file, 'default')),
        params: paramsOf(segs),
        layouts: appId ? [appId] : [],
      });
    }
  }

  // Route objects/JSX in code: React Router, or Vue Router (same `{ path, component, children }` shape) in Vue apps.
  const depsFor = (file) => {
    const w = workspaceOf(config.workspaces, file);
    return w ? { ...w.pkg.dependencies, ...w.pkg.devDependencies } : config.deps;
  };
  // Ownership (CODEOWNERS at the repo root) and test/story files next to each component.
  const owners = codeownersMatcher(root);
  const listDir = known?.lister ?? cachedLister();
  if (known?.lister) for (const f of known.changed) listDir.forget(path.dirname(f));
  for (const { mod, c } of entries) {
    const comp = components[c.id];
    const codeowners = owners?.(comp.file);
    if (codeowners) comp.codeowners = codeowners;
    const { tests, stories } = testsAndStories(mod.file, listDir);
    if (tests.length) comp.tests = tests;
    if (stories.length) {
      comp.stories = stories;
      // CSF stories as usage examples: story name plus the props (args) it renders with.
      const examples = stories.flatMap((s) => readStories(path.join(path.dirname(mod.file), s)).map((st) => ({ story: `${s}#${st.name}`, ...(st.args && Object.keys(st.args).length && { args: st.args }) })));
      if (examples.length) comp.examples = examples;
    }
  }

  // Literal copy in markup is a missed translation, but only in projects that use an i18n library.
  for (const { mod, c } of entries) {
    if (!c.hardcodedText || !I18N_LIBS.some((lib) => depsFor(mod.file)?.[lib])) continue;
    const { count, sample, line } = c.hardcodedText;
    (components[c.id].issues ??= []).push({ type: 'i18n-hardcoded-text', severity: 'low', message: `${count} piece(s) of hard-coded text, e.g. "${sample}"`, ...(line && { line }), fix: 'move the copy into translation files and use the i18n helper' });
  }

  // Routes count only in files the app actually loads: reachable through imports from an entry. An old App.js beside
  // src/, kept alive by an equally old index.js, is not. Entries per app root: index.html module scripts (Vite), else
  // src/index|main.*, else index|main.* at the root. No entry found means no filtering.
  // ponytail: dynamic import() outside React.lazy/route loaders is not followed; a route file loaded that way reads as stale.
  let reachable;
  const reachableFromEntries = () => {
    const entryFiles = [];
    for (const dir of [root, ...config.workspaces.map((w) => w.dir)]) {
      const html = path.join(dir, 'index.html');
      const scripts = fs.existsSync(html) ? [...fs.readFileSync(html, 'utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => path.join(dir, m[1].replace(/^\.?\//, ''))) : [];
      const named = (sub) => ['index', 'main'].flatMap((n) => ['.tsx', '.ts', '.jsx', '.js', '.mjs'].map((e) => path.join(dir, sub, n + e)));
      const tier = [scripts, named('src'), named('')].map((list) => list.filter((f) => modules.has(f))).find((list) => list.length);
      if (tier) entryFiles.push(...tier);
    }
    if (!entryFiles.length) return null;
    const seen = new Set(entryFiles);
    for (const queue = [...entryFiles]; queue.length; ) {
      const m = modules.get(queue.shift());
      if (!m) continue;
      for (const source of [...[...m.imports.values()].map((i) => i.source), ...m.reexports.map((r) => r.source), ...m.exportAll]) {
        const target = resolveImport(m.file, source);
        if (target && !seen.has(target)) seen.add(target), queue.push(target);
      }
    }
    return seen;
  };
  const isStaleRouteFile = (file) => {
    reachable ??= reachableFromEntries() ?? false;
    return reachable !== false && !reachable.has(file);
  };
  const routeRecords = [];
  for (const mod of modules.values()) {
    mod.staleRoutes = mod.routes.length > 0 && isStaleRouteFile(mod.file);
    if (mod.staleRoutes) continue;
    const ids = (names) => (names ?? []).map((l) => idOf(resolveLocal(mod.file, l))).filter(Boolean);
    for (const r of mod.routes) {
      const route = routePath(r.segments, (ref) => constValue(mod.file, ref));
      const page = {
        router: depsFor(mod.file)?.['vue-router'] ? 'vue-router' : depsFor(mod.file)?.['@angular/router'] ? 'angular-router' : 'react-router',
        file: rel(mod.file),
        component: idOf(resolveLocal(mod.file, r.component)),
        layouts: ids(r.layouts),
        wrappers: ids(r.wrappers),
        alternates: ids(r.alternates),
        extras: ids(r.extras),
      };
      routeRecords.push({ file: mod.file, route, page });
    }
  }

  // Descendant <Routes> (React Router v6+): routes declared in a module that a `/parent/*` page renders, or that one of
  // its modules imports (a route config file), match the rest of the URL, so they live under /parent, even when
  // written with a leading slash. Routes in no such module keep their path from the root.
  // ponytail: one level of nesting; a splat route that is itself nested does not mount further routes.
  const modOfId = new Map(entries.map(({ mod, c }) => [c.id, mod]));
  const reach = (page) => {
    const files = new Set();
    const seen = new Set();
    const queue = [...page.layouts, ...page.wrappers, page.component].filter(Boolean);
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id) || !components[id]) continue;
      seen.add(id);
      const mod = modOfId.get(id);
      if (mod) [mod.file, ...[...mod.imports.values()].map((i) => resolveImport(mod.file, i.source))].forEach((f) => files.add(f));
      queue.push(...(components[id].renders ?? []));
    }
    return files;
  };
  const mounts = routeRecords.filter((r) => r.route.endsWith('/*')).map((r) => ({ file: r.file, prefix: r.route.slice(0, -2) || '/', files: reach(r.page) }));
  for (const r of routeRecords) {
    const at = mounts.filter((m) => m.file !== r.file && m.files.has(r.file));
    if (!at.length) addRoutePage(r.route, r.page);
    for (const m of at) addRoutePage(joinRoute([m.prefix, r.route.slice(1) || null]), r.page);
  }

  // File-system routers other than Next.js (Remix, React Router v7, TanStack, Gatsby, SolidStart, Qwik City), per app root.
  const appRoots = [{ dir: root, deps: config.deps, html: config.html }, ...config.workspaces.map((w) => ({ dir: w.dir, deps: { ...w.pkg.dependencies, ...w.pkg.devDependencies } }))];
  const refId = (ref) => idOf(ref.local ? resolveLocal(ref.file, ref.local) : resolveExport(ref.file, ref.export));
  const resourceRoutes = [];
  for (const app of appRoots) {
    for (const r of fileSystemRoutes(app, [...modules.keys()], modules)) {
      const component = refId(r.page);
      // Route modules without a component but with a loader/action are resource routes: endpoints, not pages.
      if (!component) {
        const exported = modules.get(r.file)?.exports ?? new Map();
        const methods = [exported.has('loader') && 'GET', exported.has('action') && 'POST'].filter(Boolean);
        if (methods.length) resourceRoutes.push([r.route, { kind: 'resource-route', file: r.file, methods }]);
        continue;
      }
      addPage(r.route, { router: r.router, file: rel(r.file), component, params: r.params, layouts: r.layouts.map(refId).filter(Boolean) });
    }
  }

  for (const [route, page] of Object.entries(pages)) {
    const seen = new Set();
    const queue = [...page.layouts, ...(page.wrappers ?? []), page.component, ...(page.alternates ?? []), ...(page.extras ?? [])].filter(Boolean);
    delete page.extras;
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id) || !components[id]) continue;
      seen.add(id);
      queue.push(...(components[id].renders ?? []));
    }
    page.components = [...seen];
    seen.forEach((id) => (components[id].pages = [...(components[id].pages ?? []), route]));
    pages[route] = compact(page);
  }

  // React Server Components: in App Router projects, a component is client-rendered when its module says 'use client'
  // or a client component renders it; everything else on an app-router page renders on the server.
  const appRouterIds = new Set(Object.values(pages).filter((p) => p.router === 'next-app').flatMap((p) => p.components ?? []));
  if (appRouterIds.size) {
    const client = new Set(entries.filter(({ mod }) => mod.directive === 'use client').map(({ c }) => c.id));
    for (const queue = [...client]; queue.length; ) for (const child of components[queue.shift()]?.renders ?? []) if (!client.has(child)) client.add(child), queue.push(child);
    for (const id of appRouterIds) {
      const comp = components[id];
      if (!comp) continue;
      comp.rendering = client.has(id) ? 'client' : 'server';
      // Server Components cannot hold state or run hooks (only `use`) and cannot be classes; Next fails the build.
      const hooks = (comp.hooks ?? []).filter((h) => h.name !== 'use').map((h) => h.name);
      if (comp.rendering === 'server' && (comp.kind === 'class' || hooks.length)) {
        const what = comp.kind === 'class' ? 'is a class component' : `calls ${hooks.slice(0, 3).join(', ')}`;
        (comp.issues ??= []).push({ type: 'client-code-in-server-component', severity: 'high', message: `${comp.name} ${what} but renders as a Server Component`, fix: "add 'use client' at the top of its file, or render it from a client component" });
      }
    }
  }

  heavyImports(entries, components);

  // Custom hooks catalogued in their own right: where they live, what they read and call, which components use them.
  const hookList = [...modules].flatMap(([file, mod]) => Object.keys(mod.customHooks ?? {}).map((name) => ({ name, file: rel(file) })));
  const hookIds = new Map(assignIds(hookList, previous?.hooks, aliases).map((id, i) => [`${hookList[i].name}@${hookList[i].file}`, id]));
  const hooks = {};
  const hookId = (file, name) => hookIds.get(`${name}@${rel(file)}`);
  for (const [file, mod] of modules) {
    for (const [name, facts] of Object.entries(mod.customHooks ?? {})) {
      const reads = [...new Set(facts.reads.map((r) => (r.kind === 'context' ? r.store : r.kind === 'zustand' ? `${r.store}${r.path ? ` ${r.path}` : ''}` : `redux ${r.path}`)))];
      hooks[hookId(file, name)] = { file: rel(file), line: facts.line, reads, calls: facts.calls.filter((c) => c !== name), usedBy: [] };
    }
  }
  for (const { mod, c } of entries) {
    for (const h of c.hooks ?? []) {
      if (h.category !== 'custom') continue;
      const found = findHook(mod.file, h.name);
      const hook = found && hooks[hookId(found.file, h.name)];
      if (hook && !hook.usedBy.includes(c.id)) hook.usedBy.push(c.id);
    }
  }

  const workspaceName = (file) => workspaceOf(config.workspaces, file)?.name;
  const svelteKitRoots = appRoots.filter((a) => a.deps?.['@sveltejs/kit']).map((a) => a.dir);
  const astroRoots = appRoots.filter((a) => a.deps?.astro).map((a) => a.dir);
  const endpoints = collectEndpoints({ nextRoots, svelteKitRoots, astroRoots, modules, rel, resolveImport, workspaceName });
  for (const [route, entry] of resourceRoutes) {
    const workspace = workspaceName(entry.file);
    endpoints[endpoints[route] ? `${route} (${workspace ?? entry.kind})` : route] = compact({ ...entry, file: rel(entry.file), workspace });
  }

  lap('link');
  const { stores, styles, health, duplicates, tokens, styleCache, styleCacheDirty } = buildProjectInsights({
    modules,
    entries,
    components,
    pages,
    rel,
    resolveImport,
    styleFiles: projectFiles.styles,
    styleCache: cache?.version === CACHE_VERSION ? cache.styles : undefined,
    touched,
    roots: [root, ...config.workspaces.map((w) => w.dir)],
  });
  for (const comp of Object.values(components)) if (comp.styles === undefined) delete comp.styles;

  lap('insights');
  const routers = [...new Set(Object.values(pages).map((p) => p.router))];
  const catalogue = {
    catalogue: '1.1',
    info: compact({
      title: config.title,
      version: config.version,
      framework: config.framework,
      packageManager: config.packageManager,
      workspaces: config.workspaces.map((w) => w.name),
      routers,
      generator: `frontdex ${PKG.version}`,
      generatedAt: new Date().toISOString(),
    }),
    components: sortKeys(components),
    pages: sortKeys(pages),
    ...(Object.keys(endpoints).length && { endpoints: sortKeys(endpoints) }),
    stores: sortKeys(stores),
    styles: sortKeys(styles),
    ...(Object.keys(tokens.definitions).length && { tokens: { definitions: sortKeys(tokens.definitions), ...(tokens.drift.length && { drift: tokens.drift }) } }),
    ...(duplicates.length && { duplicates }),
    ...(Object.keys(hooks).length && { hooks: sortKeys(Object.fromEntries(Object.entries(hooks).map(([k, h]) => [k, compact(h)]))) }),
    health,
  };
  const liveAliases = resolveAliases(aliases, (id) => id in components || id in hooks);
  if (Object.keys(liveAliases).length) catalogue.aliases = sortKeys(liveAliases);
  return {
    catalogue,
    warnings,
    files: projectFiles,
    timings,
    resolver: resolveImport,
    lister: listDir,
    // What patchProject() needs to re-link a few components without a full scan; kept by watch sessions only.
    linker: { modules, localIndex, linkComponent, rel, files: nextFiles, resolveImport },
    stats: { files: modules.size, components: entries.length, pages: Object.keys(pages).length },
    delta,
    cache: { version: CACHE_VERSION, files: nextFiles, styles: styleCache },
    cacheDirty: !cache || cache.version !== CACHE_VERSION || delta.parsed > 0 || delta.removed.length > 0 || styleCacheDirty,
  };
}

// What makes a module's components and routes what they are. If it changes, ids or pages may change: full scan.
const shapeOf = (mod) => JSON.stringify([mod.components.map((c) => [c.name, c.tag ?? null]), mod.routes, mod.fileRoute ?? null, mod.routeConfig ?? null]);
// What other modules see of it while linking (exports, and the hooks, schemas and constants resolved through them).
// If it changes, the components of files importing it are re-linked too.
const interfaceOf = (mod) => JSON.stringify([[...mod.exports], mod.reexports, mod.exportAll, [...mod.aliases], mod.customHooks ?? null, mod.schemas ?? null, mod.consts ?? null]);
// Record fields that project-wide passes fill in; a patched record keeps the previous values until the next full scan.
const CARRIED = ['styles', 'usedBy', 'pages', 'rendering', 'codeowners', 'tests', 'stories', 'examples'];
const issueKey = (i) => `${i.type}\0${i.message}\0${i.line ?? ''}`;

/** Files whose linking reads `file`: its importers, and theirs too when they re-export it (barrels). */
function importersOf(modules, resolveImport, file) {
  const users = new Map();
  for (const [f, m] of modules) {
    const exported = new Set(m.exports.values());
    const sources = [...[...m.imports].map(([local, i]) => [i.source, exported.has(local)]), ...m.reexports.map((r) => [r.source, true]), ...m.exportAll.map((s) => [s, true])];
    for (const [source, passesOn] of sources) {
      const target = resolveImport(f, source);
      if (target) (users.get(target) ?? users.set(target, []).get(target)).push({ file: f, passesOn });
    }
  }
  const out = new Set();
  for (const queue = [file]; queue.length; ) {
    for (const u of users.get(queue.shift()) ?? []) {
      if (out.has(u.file)) continue;
      out.add(u.file);
      if (u.passesOn) queue.push(u.file);
    }
  }
  out.delete(file);
  return out;
}

/**
 * Watch-session fast path: re-parses `changed` files and re-links only their components (plus those of importing files
 * when a file's interface changed), splicing the records into `catalogue`. Fields from project-wide passes (CARRIED,
 * and issues that did not come from parsing) keep their previous values; the next full scan recomputes everything.
 * Returns null when only a full scan is correct: a file was added, removed or broke, or its components or routes changed.
 * `linker` comes from the last scanProject() and is updated in place, so patches can follow one another.
 */
export function patchProject(linker, catalogue, changed) {
  const { modules, localIndex, linkComponent, rel, files, resolveImport } = linker;
  const updates = [];
  for (const file of changed) {
    const entry = files[rel(file)];
    const old = modules.get(file);
    const exists = fs.existsSync(file);
    // Unknown and gone: a temp file an editor wrote and renamed over the real one (sed -i, vim, many save-via-rename tools).
    if (!entry && !exists) continue;
    if (!entry?.mod || !old || !exists) return null;
    const stat = fs.statSync(file);
    const { hash, mod: parsed } = loadOne(file, entry.hash);
    if (!parsed) {
      files[rel(file)] = { ...entry, mtimeMs: stat.mtimeMs, size: stat.size };
      continue;
    }
    if (parsed.error) return null;
    const mod = deserialize(parsed, file);
    if (shapeOf(mod) !== shapeOf(old)) return null;
    updates.push({ file, entry: { mtimeMs: stat.mtimeMs, size: stat.size, hash, mod: parsed }, before: entry.mod, interfaceChanged: interfaceOf(mod) !== interfaceOf(old) });
  }
  if (!updates.length) return { catalogue, changed: false, parsed: 0, relinked: 0 };

  const relink = new Set();
  const parsedBefore = new Map();
  for (const u of updates) {
    files[rel(u.file)] = u.entry;
    parsedBefore.set(u.file, u.before);
    relink.add(u.file);
  }
  for (const u of updates) if (u.interfaceChanged) for (const f of importersOf(modules, resolveImport, u.file)) relink.add(f);

  // Linking mutates component records, so every re-linked file starts again from its pristine cached parse.
  const fresh = [...relink].map((file) => {
    const mod = deserialize(files[rel(file)].mod, file);
    const ids = new Map([...(localIndex.get(file)?.values() ?? [])].map((c) => [c.name, c.id]));
    for (const c of mod.components) c.id = ids.get(c.name);
    modules.set(file, mod);
    localIndex.set(file, new Map(mod.components.map((c) => [c.name, c])));
    return mod;
  });

  const components = { ...catalogue.components };
  const before = new Map();
  for (const mod of fresh) {
    const parseBefore = parsedBefore.get(mod.file) ?? files[rel(mod.file)].mod;
    for (const c of mod.components) {
      const prev = catalogue.components[c.id];
      if (!prev) return null;
      const record = linkComponent(mod, c);
      for (const k of CARRIED) {
        if (prev[k] === undefined) delete record[k];
        else record[k] = prev[k];
      }
      // Issues the parser found are current; the rest came from project-wide passes and are carried over.
      const fromParse = new Set((parseBefore.components.find((x) => x.name === c.name)?.issues ?? []).map(issueKey));
      const issues = [...(record.issues ?? []), ...(prev.issues ?? []).filter((i) => !fromParse.has(issueKey(i)))];
      if (issues.length) record.issues = issues;
      else delete record.issues;
      before.set(c.id, prev);
      components[c.id] = record;
    }
  }
  // usedBy follows the new renders; children are copied before they change (the old catalogue may still be in use).
  for (const [id, prev] of before) {
    const was = new Set(prev.renders ?? []);
    const now = new Set(components[id].renders ?? []);
    for (const child of now) if (!was.has(child) && components[child]) components[child] = { ...components[child], usedBy: [...(components[child].usedBy ?? []), id] };
    for (const child of was) if (!now.has(child) && components[child]) components[child] = compact({ ...components[child], usedBy: (components[child].usedBy ?? []).filter((x) => x !== id) });
  }
  const changedRecords = [...before].some(([id, prev]) => JSON.stringify(prev) !== JSON.stringify(components[id]));
  return { catalogue: { ...catalogue, components }, changed: changedRecords, parsed: updates.length, relinked: before.size };
}

/**
 * Stable IDs for `items` ({ name, file }), parallel to the input. Rules, in order:
 *  1. same name and file as an entry of `previous` (the last catalogue): keep that entry's ID;
 *  2. a name whose single previous holder vanished while a single new one appeared: a move. A bare ID stays bare; a
 *     `name@file` ID is re-pointed at the new file and the old one recorded in `aliases`;
 *  3. anything else: the bare name, unless the name is shared in this scan or already held, then `name@file`.
 * With no previous catalogue this is the 1.x rule (shared name → every holder qualified), so cold scans are unchanged;
 * with one, adding a same-named component elsewhere qualifies only the newcomer.
 */
export function assignIds(items, previous = {}, aliases = {}) {
  const ids = new Array(items.length);
  const taken = new Set();
  const nameOf = (id, entry) => entry.name ?? id.replace(/@.*/, '');
  const prevByKey = new Map(Object.entries(previous).map(([id, e]) => [`${nameOf(id, e)}\0${e.file}`, id]));
  items.forEach((it, i) => {
    const id = prevByKey.get(`${it.name}\0${it.file}`);
    if (id && !taken.has(id)) taken.add((ids[i] = id));
  });

  const group = (pairs) => pairs.reduce((m, [k, v]) => m.set(k, [...(m.get(k) ?? []), v]), new Map());
  const gone = group(Object.entries(previous).filter(([id]) => !taken.has(id)).map(([id, e]) => [nameOf(id, e), id]));
  const fresh = group(items.map((it, i) => [it.name, i]).filter(([, i]) => !ids[i]));
  for (const [name, list] of fresh) {
    const was = gone.get(name);
    if (list.length !== 1 || was?.length !== 1) continue;
    const i = list[0];
    const id = was[0].includes('@') ? `${name}@${items[i].file}` : was[0];
    if (taken.has(id)) continue;
    taken.add((ids[i] = id));
    if (id !== was[0]) aliases[was[0]] = id;
  }

  const count = new Map();
  for (const it of items) count.set(it.name, (count.get(it.name) ?? 0) + 1);
  items.forEach((it, i) => {
    if (ids[i]) return;
    ids[i] = count.get(it.name) > 1 || taken.has(it.name) ? `${it.name}@${it.file}` : it.name;
    taken.add(ids[i]);
  });
  return ids;
}

/** Collapses alias chains (a→b, b→c becomes a→c) and drops aliases that are live IDs again or point at nothing live. */
function resolveAliases(aliases, isLive) {
  const out = {};
  for (const from of Object.keys(aliases)) {
    let to = aliases[from];
    for (const seen = new Set([from]); aliases[to] && !seen.has(to); ) seen.add(to), (to = aliases[to]);
    if (!isLive(from) && isLive(to)) out[from] = to;
  }
  return out;
}

function followAlias(mod, local) {
  const seen = new Set();
  while (mod.aliases.has(local) && !seen.has(local)) {
    seen.add(local);
    local = mod.aliases.get(local);
  }
  return local;
}

function paramsOf(segments) {
  return segments.map((s) => s.match(/^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/)?.[1]).filter(Boolean);
}

function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function isDir(p) {
  return fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

export function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    }),
  );
}
