import fs from 'node:fs';
import path from 'node:path';
import { listSourceFiles } from './files.js';
import { createResolver } from './resolve.js';
import { parseFile } from './parse-file.js';

const PKG = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const PAGE_FILE = /^page\.(tsx|jsx|ts|js)$/;

export function scanProject(config) {
  const root = config.root;
  const rel = (f) => path.relative(root, f).split(path.sep).join('/');
  const resolveImport = createResolver(root);
  const modules = new Map();
  const warnings = [];

  for (const file of listSourceFiles(config)) {
    const mod = parseFile(file);
    if (mod.error) warnings.push(`${rel(file)}: ${mod.error}`);
    modules.set(file, mod);
  }

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

  const resolveLocal = (file, local, seen = new Set()) => {
    const mod = modules.get(file);
    if (!mod) return null;
    const [head, member] = local.split('.');
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

  const components = {};
  for (const { mod, c } of entries) {
    const renders = new Set();
    const externals = new Set();
    for (const j of c.jsx) {
      const r = resolveLocal(mod.file, j.name);
      if (r?.id && r.id !== c.id) renders.add(r.id);
      else if (r?.external && !j.soft) externals.add(r.external);
    }
    const exportNames = [...mod.exports].filter(([, local]) => followAlias(mod, local) === c.name).map(([e]) => e);
    components[c.id] = compact({
      name: c.name,
      file: rel(mod.file),
      line: c.line,
      kind: c.kind,
      export: exportNames.includes('default') ? 'default' : exportNames.length ? 'named' : 'none',
      description: c.description,
      status: c.status,
      props: c.props,
      state: c.state,
      context: c.context,
      refs: c.refs,
      hooks: c.hooks,
      lifecycle: c.lifecycle,
      renders: [...renders],
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
    const key = pages[route] ? `${route} (${page.router})` : route;
    pages[key] = page;
  };
  const idOf = (r) => r?.id;

  const nextDirs = (names) => (config.framework === 'next' ? names.map((d) => path.join(root, d)).filter(isDir) : []);

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
      addPage('/' + routeSegs.join('/'), {
        router: 'next-app',
        file: rel(file),
        component: idOf(resolveExport(file, 'default')),
        params: paramsOf(routeSegs),
        layouts,
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

  for (const mod of modules.values()) {
    for (const r of mod.routes) {
      addPage(r.path, {
        router: 'react-router',
        file: rel(mod.file),
        component: idOf(resolveLocal(mod.file, r.component)),
        params: [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1]),
        layouts: r.layouts.map((l) => idOf(resolveLocal(mod.file, l))).filter(Boolean),
      });
    }
  }

  for (const [route, page] of Object.entries(pages)) {
    const seen = new Set();
    const queue = [...page.layouts, page.component].filter(Boolean);
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

  const routers = [...new Set(Object.values(pages).map((p) => p.router))];
  const catalogue = {
    catalogue: '1.0',
    info: compact({
      title: config.title,
      version: config.version,
      framework: config.framework,
      routers,
      generator: `react-catalogue ${PKG.version}`,
      generatedAt: new Date().toISOString(),
    }),
    components: sortKeys(components),
    pages: sortKeys(pages),
  };
  return { catalogue, warnings, stats: { files: modules.size, components: entries.length, pages: Object.keys(pages).length } };
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
