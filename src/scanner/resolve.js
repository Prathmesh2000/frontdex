import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readJsonc } from '../config.js';
import { SOURCE_EXT } from './files.js';

// Build output folders whose source usually sits in `src/` next to them (monorepo packages often point `main` at dist).
const BUILD_DIR = /[\\/](dist|build|lib|out)[\\/]/;
// Conditions tried, in order, when a workspace package has an `exports` map. `source` points at untranspiled code.
const CONDITIONS = ['source', 'development', 'import', 'module', 'browser', 'default', 'require', 'types'];

/**
 * Resolves import specifiers to project files: relative paths, tsconfig/jsconfig `paths` and `baseUrl` (the config
 * nearest to the importing file, following `extends`), and workspace package names (`@acme/ui`, `@acme/ui/button`).
 * Anything else is an external package and resolves to undefined.
 */
export function createResolver(root, { workspaces = [] } = {}) {
  const cache = new Map();
  const compilerCache = new Map();
  const packages = new Map(workspaces.map((w) => [w.name, w]));

  const isFile = (p) => fs.statSync(p, { throwIfNoEntry: false })?.isFile();
  const tryFile = (base) => {
    const candidates = [base, ...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => path.join(base, 'index' + e))];
    return candidates.find(isFile);
  };
  // `dist/index.js` → `src/index` (then tried with every source extension), for packages built before publishing.
  const toSource = (file) => (BUILD_DIR.test(file) ? tryFile(file.replace(BUILD_DIR, `${path.sep}src${path.sep}`).replace(/(\.d)?\.(c|m)?[jt]sx?$/, '')) : undefined);
  const tryTarget = (file) => (BUILD_DIR.test(file) && toSource(file)) || tryFile(file.replace(/\.(c|m)?js$/, '')) || tryFile(file);

  /** Effective compiler options for a directory: nearest tsconfig/jsconfig up to the project root. */
  const compilerFor = (dir) => {
    if (compilerCache.has(dir)) return compilerCache.get(dir);
    let found = null;
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) {
        found = readCompilerOptions(file);
        break;
      }
    }
    const parent = path.dirname(dir);
    const result = found ?? (dir === root || parent === dir || !(dir + path.sep).startsWith(root + path.sep) ? { paths: [], baseUrl: null, pathsBase: root } : compilerFor(parent));
    compilerCache.set(dir, result);
    return result;
  };

  const resolvePackage = (pkg, subpath) => {
    const { dir, pkg: json } = pkg;
    const exported = exportTarget(json.exports, subpath ? `./${subpath}` : '.');
    if (exported) {
      const hit = tryTarget(path.resolve(dir, exported));
      if (hit) return hit;
    }
    if (subpath) return tryFile(path.join(dir, 'src', subpath)) ?? tryFile(path.join(dir, subpath));
    for (const field of [json.source, null, json.module, json.main, json.types]) {
      const hit = field === null ? tryFile(path.join(dir, 'src', 'index')) : field && tryTarget(path.resolve(dir, field));
      if (hit) return hit;
    }
    return tryFile(path.join(dir, 'index'));
  };

  const resolveBare = (fromFile, spec) => {
    const { paths, baseUrl, pathsBase } = compilerFor(path.dirname(fromFile));
    for (const [pattern, targets] of paths) {
      const star = pattern.indexOf('*');
      const prefix = star === -1 ? pattern : pattern.slice(0, star);
      const suffix = star === -1 ? '' : pattern.slice(star + 1);
      const matches = star === -1 ? spec === pattern : spec.startsWith(prefix) && spec.endsWith(suffix);
      if (!matches) continue;
      const wildcard = star === -1 ? '' : spec.slice(prefix.length, spec.length - suffix.length);
      for (const target of targets) {
        const hit = tryFile(path.resolve(pathsBase, target.replace('*', wildcard)));
        if (hit) return hit;
      }
    }
    // SvelteKit's built-in `$lib` alias (src/lib), declared only in the generated .svelte-kit/tsconfig.json.
    if (spec === '$lib' || spec.startsWith('$lib/')) {
      for (let dir = path.dirname(fromFile); (dir + path.sep).startsWith(root + path.sep); dir = path.dirname(dir)) {
        const lib = path.join(dir, 'src', 'lib');
        if (fs.existsSync(lib)) return tryFile(path.join(lib, spec.slice(5)));
        if (dir === root) break;
      }
    }
    const scoped = spec.startsWith('@');
    const parts = spec.split('/');
    const name = parts.slice(0, scoped ? 2 : 1).join('/');
    const pkg = packages.get(name);
    if (pkg) return resolvePackage(pkg, parts.slice(scoped ? 2 : 1).join('/'));
    return baseUrl ? tryFile(path.resolve(baseUrl, spec)) : undefined;
  };

  return function resolve(fromFile, spec) {
    const key = fromFile + '\0' + spec;
    if (cache.has(key)) return cache.get(key);
    const result = spec.startsWith('.') ? tryFile(path.resolve(path.dirname(fromFile), spec)) : resolveBare(fromFile, spec);
    cache.set(key, result);
    return result;
  };
}

/**
 * compilerOptions of one tsconfig, merged over its `extends` chain (relative paths or packages). `paths` are relative to
 * `baseUrl` when set, otherwise to the config file that declares them, as in TypeScript 4.1+.
 */
function readCompilerOptions(file, depth = 0) {
  let json;
  try {
    json = readJsonc(file);
  } catch {
    return { paths: [], baseUrl: null, pathsBase: path.dirname(file) };
  }
  let base = { paths: [], baseUrl: null, pathsBase: path.dirname(file) };
  for (const ext of [json.extends].flat().filter(Boolean)) {
    if (depth > 5) break;
    const target = resolveExtends(file, ext);
    if (target) base = { ...base, ...pruneEmpty(readCompilerOptions(target, depth + 1)) };
  }
  const opts = json.compilerOptions ?? {};
  const baseUrl = opts.baseUrl != null ? path.resolve(path.dirname(file), opts.baseUrl) : base.baseUrl;
  const paths = opts.paths ? Object.entries(opts.paths) : base.paths;
  const pathsBase = baseUrl ?? (opts.paths ? path.dirname(file) : base.pathsBase);
  return { paths, baseUrl, pathsBase };
}

const pruneEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v != null && !(k === 'paths' && !v.length)));

function resolveExtends(fromFile, ext) {
  if (ext.startsWith('.')) {
    const abs = path.resolve(path.dirname(fromFile), ext);
    return [abs, `${abs}.json`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  }
  try {
    return createRequire(fromFile).resolve(ext);
  } catch {
    return null;
  }
}

/** Resolves a package `exports` entry for a subpath (`.` or `./x`), trying CONDITIONS in order; supports `./*` patterns. */
function exportTarget(exports, subpath) {
  if (!exports) return null;
  const map = typeof exports === 'string' || Array.isArray(exports) || !Object.keys(exports).some((k) => k.startsWith('.')) ? { '.': exports } : exports;
  let entry = map[subpath];
  let wildcard = null;
  if (entry === undefined) {
    for (const [key, value] of Object.entries(map)) {
      const star = key.indexOf('*');
      if (star !== -1 && subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1))) {
        entry = value;
        wildcard = subpath.slice(star, subpath.length - (key.length - star - 1));
        break;
      }
    }
  }
  const pick = (v) => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(pick).find(Boolean) ?? null;
    if (v && typeof v === 'object') for (const c of CONDITIONS) if (v[c] !== undefined) return pick(v[c]);
    return null;
  };
  const target = pick(entry);
  return target && wildcard != null ? target.replace('*', wildcard) : target;
}
