import fs from 'node:fs';
import path from 'node:path';
import { readJsonc } from '../config.js';
import { SOURCE_EXT } from './files.js';

export function createResolver(root) {
  const { baseUrl, paths } = readCompilerPaths(root);
  const cache = new Map();

  const tryFile = (base) => {
    const candidates = [base, ...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => path.join(base, 'index' + e))];
    return candidates.find((c) => fs.statSync(c, { throwIfNoEntry: false })?.isFile());
  };

  return function resolve(fromFile, spec) {
    const key = fromFile + '\0' + spec;
    if (cache.has(key)) return cache.get(key);
    let result;
    if (spec.startsWith('.')) {
      result = tryFile(path.resolve(path.dirname(fromFile), spec));
    } else {
      for (const [pattern, targets] of paths) {
        const star = pattern.indexOf('*');
        const prefix = star === -1 ? pattern : pattern.slice(0, star);
        const suffix = star === -1 ? '' : pattern.slice(star + 1);
        const matches = star === -1 ? spec === pattern : spec.startsWith(prefix) && spec.endsWith(suffix);
        if (!matches) continue;
        const wildcard = star === -1 ? '' : spec.slice(prefix.length, spec.length - suffix.length);
        for (const target of targets) {
          result = tryFile(path.resolve(baseUrl, target.replace('*', wildcard)));
          if (result) break;
        }
        if (result) break;
      }
      if (!result && baseUrl !== root) result = tryFile(path.resolve(baseUrl, spec));
    }
    cache.set(key, result);
    return result;
  };
}

function readCompilerPaths(root) {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    try {
      const opts = readJsonc(file).compilerOptions ?? {};
      const baseUrl = path.resolve(root, opts.baseUrl ?? '.');
      return { baseUrl, paths: Object.entries(opts.paths ?? {}) };
    } catch {
      break;
    }
  }
  return { baseUrl: root, paths: [] };
}
