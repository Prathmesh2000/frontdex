import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listProjectFiles, updateProjectFiles } from './files.js';
import { createResolver } from './resolve.js';
import { collectEndpoints } from './endpoints.js';
import { fileSystemRoutes } from './routers.js';
import { workspaceOf } from './workspace.js';
import { loadMany, MAP_FIELDS } from './parse-pool.js';
import { buildProjectInsights } from './project.js';

const PKG = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const PAGE_FILE = /^page\.(tsx|jsx|ts|js)$/;

// Any change to the scanner's own code invalidates cached parse results.
const SCANNER_HASH = createHash('sha1')
  .update(fs.readdirSync(new URL('.', import.meta.url), { recursive: true }).filter((f) => /\.js$/.test(f)).sort().map((f) => fs.readFileSync(new URL(f.split(path.sep).join('/'), import.meta.url), 'utf8')).join('\0'))
  .digest('hex')
  .slice(0, 12);
export const CACHE_VERSION = `${PKG.version}/${SCANNER_HASH}`;

// Linking and insights mutate component records (ids, resolved schemas, store reads, issues), so those are cloned to keep
// the cache pristine; every other module field is only read and is shared with the cache entry.
const deserialize = (data, file) => ({ ...data, components: structuredClone(data.components), file, ...Object.fromEntries(MAP_FIELDS.map((k) => [k, new Map(data[k])])) });

/**
 * Parses every source file, reusing cached parse results for files whose mtime/size or content hash is unchanged.
 * Linking (imports, renders, pages) always runs over the full module set because it is cheap and cross-file.
 * `known = { files, changed, resolver }` is the watcher fast path: `files` and `resolver` come from the previous result
 * and `changed` lists the absolute paths reported since, so unchanged files skip the directory walk and the stat.
 * The reused resolver does not see tsconfig edits; the watcher ignores .json files, so restart it after changing paths.
 */
export function scanProject(config, { cache, known } = {}) {
  const root = config.root;
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
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
  const nameCount = new Map();
  entries.forEach(({ c }) => nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1));
  const localIndex = new Map();
  for (const { mod, c } of entries) {
    c.id = nameCount.get(c.name) > 1 ? `${c.name}@${rel(mod.file)}` : c.name;
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
  const components = {};
  for (const { mod, c } of entries) {
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
    components[c.id] = compact({
      name: c.name,
      file: rel(mod.file),
      workspace: workspaceOf(config.workspaces, mod.file)?.name,
      line: c.line,
      kind: c.kind,
      tag: c.tag,
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
  }
  for (const [id, comp] of Object.entries(components)) {
    for (const child of comp.renders ?? []) components[child].usedBy = [...(components[child].usedBy ?? []), id];
  }

  const pages = {};
  const addPage = (route, page) => {
    const workspace = workspaceOf(config.workspaces, path.join(root, page.file))?.name;
    if (workspace) page.workspace = workspace;
    // Two apps in a monorepo may both have `/`; the second is keyed by its workspace (or by router within one app).
    const key = pages[route] ? `${route} (${workspace && workspace !== pages[route].workspace ? workspace : page.router})` : route;
    pages[key] = page;
  };
  const idOf = (r) => r?.id;

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
  for (const mod of modules.values()) {
    for (const r of mod.routes) {
      addPage(r.path, {
        router: depsFor(mod.file)?.['vue-router'] ? 'vue-router' : depsFor(mod.file)?.['@angular/router'] ? 'angular-router' : 'react-router',
        file: rel(mod.file),
        component: idOf(resolveLocal(mod.file, r.component)),
        params: [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]),
        layouts: r.layouts.map((l) => idOf(resolveLocal(mod.file, l))).filter(Boolean),
        extras: (r.extras ?? []).map((l) => idOf(resolveLocal(mod.file, l))).filter(Boolean),
      });
    }
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
    const queue = [...page.layouts, page.component, ...(page.extras ?? [])].filter(Boolean);
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

  const workspaceName = (file) => workspaceOf(config.workspaces, file)?.name;
  const svelteKitRoots = appRoots.filter((a) => a.deps?.['@sveltejs/kit']).map((a) => a.dir);
  const astroRoots = appRoots.filter((a) => a.deps?.astro).map((a) => a.dir);
  const endpoints = collectEndpoints({ nextRoots, svelteKitRoots, astroRoots, modules, rel, resolveImport, workspaceName });
  for (const [route, entry] of resourceRoutes) {
    const workspace = workspaceName(entry.file);
    endpoints[endpoints[route] ? `${route} (${workspace ?? entry.kind})` : route] = compact({ ...entry, file: rel(entry.file), workspace });
  }

  lap('link');
  const { stores, styles, health, styleCache, styleCacheDirty } = buildProjectInsights({
    modules,
    entries,
    components,
    pages,
    rel,
    resolveImport,
    styleFiles: projectFiles.styles,
    styleCache: cache?.version === CACHE_VERSION ? cache.styles : undefined,
    touched,
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
    health,
  };
  return {
    catalogue,
    warnings,
    files: projectFiles,
    timings,
    resolver: resolveImport,
    stats: { files: modules.size, components: entries.length, pages: Object.keys(pages).length },
    delta,
    cache: { version: CACHE_VERSION, files: nextFiles, styles: styleCache },
    cacheDirty: !cache || cache.version !== CACHE_VERSION || delta.parsed > 0 || delta.removed.length > 0 || styleCacheDirty,
  };
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
