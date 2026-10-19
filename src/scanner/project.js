import fs from 'node:fs';
import path from 'node:path';
import { listSourceFiles, STYLE_EXT } from './files.js';

/*
 * Cross-file insights computed after linking:
 *   stores  – Redux slices, React contexts and zustand stores with the components that read / write / provide them
 *   styles  – every stylesheet with its classes, and each component class resolved to the file:line defining it
 *   health  – issue totals plus dead code: unused components, exports, files and imports
 */

const FRAMEWORK_FILE = /^(page|layout|template|loading|error|global-error|not-found|default|route|middleware|instrumentation|_app|_document|_error|main|index)\.(tsx|ts|jsx|js|mjs)$/;
const SEVERITIES = ['high', 'medium', 'low', 'info'];

function parseStylesheet(file) {
  const raw = fs.readFileSync(file, 'utf8');
  // Blank out comments but keep newlines so line numbers stay correct.
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const classes = {};
  const re = /([^{};]+)\{/g;
  let m;
  while ((m = re.exec(text))) {
    const selector = m[1];
    if (/^\s*@(media|supports|container|layer|keyframes|font-face|import)/.test(selector)) continue;
    const line = text.slice(0, m.index + m[0].length - selector.trimStart().length).split('\n').length;
    for (const c of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes[c[1]] ??= line;
  }
  return classes;
}

export function buildProjectInsights({ config, modules, entries, components, pages, rel, resolveImport }) {
  const idOfLocal = new Map(entries.map(({ mod, c }) => [`${mod.file}#${c.name}`, c.id]));

  // ---------- styles ----------
  const sheets = {};
  for (const file of listSourceFiles(config, STYLE_EXT)) sheets[rel(file)] = { module: /\.module\.\w+$/.test(file), classes: parseStylesheet(file), importedBy: [] };
  const globalIndex = new Map();
  for (const [file, sheet] of Object.entries(sheets)) {
    if (sheet.module) continue;
    for (const [cls, line] of Object.entries(sheet.classes)) if (!globalIndex.has(cls)) globalIndex.set(cls, `${file}:${line}`);
  }
  for (const { mod, c } of entries) {
    const comp = components[c.id];
    const imported = (mod.styleImports ?? []).map((s) => ({ ...s, file: resolveImport(mod.file, s.source) }));
    for (const s of imported) if (s.file && sheets[rel(s.file)] && !sheets[rel(s.file)].importedBy.includes(rel(mod.file))) sheets[rel(s.file)].importedBy.push(rel(mod.file));
    const styles = {};
    if (c.styles?.classes?.length) styles.classes = c.styles.classes.map((name) => ({ name, ...(globalIndex.has(name) && { at: globalIndex.get(name) }) }));
    if (c.styles?.modules?.length) {
      styles.modules = c.styles.modules.map((m) => {
        const abs = imported.find((s) => s.source === m.file)?.file;
        const sheet = abs && sheets[rel(abs)];
        return { file: abs ? rel(abs) : m.file, classes: m.classes.map((name) => ({ name, ...(sheet?.classes[name] && { at: `${rel(abs)}:${sheet.classes[name]}` }) })) };
      });
    }
    const own = imported.filter((s) => s.file && !s.module).map((s) => rel(s.file));
    if (own.length) styles.sheets = own;
    if (Object.keys(styles).length) comp.styles = styles;
    else delete comp.styles;
  }
  const styles = Object.fromEntries(Object.entries(sheets).map(([f, s]) => [f, { module: s.module, classes: Object.keys(s.classes).length, ...(s.importedBy.length && { importedBy: s.importedBy }) }]));

  // ---------- stores ----------
  const stores = {};
  const reduxKeys = new Map();
  const allStores = [...modules.values()].flatMap((mod) => (mod.stores ?? []).map((s) => ({ ...s, file: rel(mod.file), thunks: mod.thunks ?? [] })));
  for (const s of allStores.filter((x) => x.kind === 'redux-store')) for (const r of s.reducers) if (r.key) reduxKeys.set(r.key, r.value);
  for (const s of allStores) {
    if (s.kind === 'redux-store') continue;
    const id = s.kind === 'redux-slice' ? `redux:${s.name}` : s.kind === 'context' ? `context:${s.name}` : `zustand:${s.name}`;
    const key = s.kind === 'redux-slice' ? ([...reduxKeys].find(([k, v]) => k === s.name || String(v).toLowerCase().startsWith(s.name.toLowerCase()) || String(v).startsWith(s.local))?.[0] ?? s.name) : undefined;
    stores[id] = {
      kind: s.kind,
      name: s.name,
      file: s.file,
      line: s.line,
      ...(key && { key }),
      ...(s.state?.length && { state: s.state }),
      ...(s.actions?.length && { actions: s.actions }),
      ...(s.kind === 'redux-slice' && s.thunks.length && { thunks: s.thunks.map((t) => t.name) }),
      ...(s.default && { default: s.default }),
      readers: [],
      writers: [],
      ...(s.kind === 'context' && { providers: [] }),
    };
  }
  const add = (list, id) => !list.includes(id) && list.push(id);
  for (const { c } of entries) {
    const comp = components[c.id];
    for (const r of comp.store?.reads ?? []) {
      let sid;
      if (r.kind === 'redux') sid = Object.keys(stores).find((k) => stores[k].kind === 'redux-slice' && r.path && r.path.split('.')[0] === stores[k].key);
      else if (r.kind === 'zustand') sid = `zustand:${r.store}`;
      else if (r.kind === 'context') sid = `context:${r.store}`;
      if (!sid || !stores[sid]) continue;
      r.storeId = sid;
      const isAction = r.kind === 'zustand' && stores[sid].actions?.includes(r.path);
      add(isAction ? stores[sid].writers : stores[sid].readers, c.id);
    }
    for (const w of comp.store?.writes ?? []) {
      const sid = Object.keys(stores).find((k) => stores[k].kind === 'redux-slice' && (stores[k].actions?.includes(w.action) || stores[k].thunks?.includes(w.action)));
      if (!sid) continue;
      w.storeId = sid;
      add(stores[sid].writers, c.id);
    }
    for (const j of c.jsx) {
      const m = j.name.match(/^(\w+)\.Provider$/);
      if (m && stores[`context:${m[1]}`]) add(stores[`context:${m[1]}`].providers, c.id);
    }
    if (comp.store && !comp.store.reads.length && !comp.store.writes.length) delete comp.store;
  }

  // ---------- deprecated usage ----------
  for (const [id, comp] of Object.entries(components)) {
    for (const child of comp.renders ?? []) {
      if (components[child]?.status === 'deprecated') {
        comp.issues = [...(comp.issues ?? []), { type: 'deprecated-usage', severity: 'medium', message: `renders deprecated component ${components[child].name}`, fix: components[child].description?.match(/use\s+\w+/i)?.[0] ?? 'migrate to its replacement' }];
      }
    }
    if (!comp.issues?.length) delete comp.issues;
  }

  // ---------- dead code ----------
  const used = new Set();
  const importedFiles = new Set();
  const markAll = new Set();
  for (const mod of modules.values()) {
    for (const imp of mod.imports.values()) {
      const target = resolveImport(mod.file, imp.source);
      if (!target) continue;
      importedFiles.add(target);
      if (imp.imported === '*') markAll.add(target);
      else used.add(`${target}#${imp.imported}`);
    }
    for (const r of mod.reexports) {
      const target = resolveImport(mod.file, r.source);
      if (target) importedFiles.add(target), used.add(`${target}#${r.imported}`);
    }
    for (const src of mod.exportAll) {
      const target = resolveImport(mod.file, src);
      if (target) importedFiles.add(target), markAll.add(target);
    }
    for (const source of mod.typeImports ?? []) {
      const target = resolveImport(mod.file, source);
      if (target) importedFiles.add(target);
    }
    for (const s of mod.styleImports ?? []) {
      const target = resolveImport(mod.file, s.source);
      if (target) importedFiles.add(target);
    }
  }
  const isEntry = (file) => FRAMEWORK_FILE.test(path.basename(file)) || /(^|\/)(pages|app)\//.test(rel(file)) || [...modules.get(file)?.routes ?? []].length > 0;
  const unusedFiles = [];
  const unusedExports = [];
  for (const mod of modules.values()) {
    if (isEntry(mod.file)) continue;
    if (!importedFiles.has(mod.file)) {
      unusedFiles.push(rel(mod.file));
      continue;
    }
    if (markAll.has(mod.file)) continue;
    for (const [exported, local] of mod.exports) {
      if (used.has(`${mod.file}#${exported}`)) continue;
      if (idOfLocal.has(`${mod.file}#${local}`)) continue; // components are reported as unused components instead
      unusedExports.push({ file: rel(mod.file), name: exported });
    }
  }
  const unusedComponents = Object.entries(components)
    .filter(([, c]) => !c.usedBy?.length && !c.pages?.length && !FRAMEWORK_FILE.test(path.basename(c.file)))
    .map(([id]) => id);
  const unusedImports = [...modules.values()].flatMap((mod) => (mod.unusedImports ?? []).map((u) => ({ file: rel(mod.file), ...u })));

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byType = {};
  for (const comp of Object.values(components)) {
    for (const i of comp.issues ?? []) {
      counts[i.severity]++;
      byType[i.type] = (byType[i.type] ?? 0) + 1;
    }
  }
  if (unusedImports.length) byType['unused-import'] = unusedImports.length;
  counts.low += unusedImports.length;

  const health = {
    issues: counts,
    byType,
    ...(unusedComponents.length && { unusedComponents }),
    ...(unusedExports.length && { unusedExports }),
    ...(unusedFiles.length && { unusedFiles }),
    ...(unusedImports.length && { unusedImports }),
  };
  return { stores, styles, health };
}
