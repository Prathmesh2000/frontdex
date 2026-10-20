import { createRequire } from 'node:module';
import path from 'node:path';

// Helpers shared by the non-JSX adapters (Vue, Svelte).

const ownRequire = createRequire(import.meta.url);
const loaded = new Map();

/**
 * Loads a framework compiler (vue/compiler-sfc, svelte/compiler) from the scanned project first, so the app's own
 * version parses its files, then from frontdex's dev dependencies. Null when neither has it.
 */
export function loadFromProject(file, name) {
  const key = `${path.dirname(file)}\0${name}`;
  if (!loaded.has(key)) {
    let mod = null;
    for (const req of [createRequire(file), ownRequire]) {
      try {
        mod = req(name);
        break;
      } catch {}
    }
    loaded.set(key, mod);
  }
  return loaded.get(key);
}

/** Source text of a node, whitespace-collapsed and cut to `max` characters. */
export function snippet(code, node, max = 40) {
  const s = code.slice(node.start, node.end).replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** fetch / $fetch / axios-like `client.get('/x')` calls, as ApiCall records (without `in`/`line`). */
export function apiCall(name, node, text) {
  const arg = node.arguments[0];
  const target = arg?.type === 'StringLiteral' ? arg.value : arg?.type === 'TemplateLiteral' ? text(arg, 60) : undefined;
  if (name === 'fetch' || name === '$fetch') return { via: name, method: 'GET', ...(target && { target }) };
  const m = /^(axios|api|http|client|\$axios)\.(get|post|put|patch|delete)$/i.exec(name);
  if (m) return { via: name, method: m[2].toUpperCase(), ...(target && { target }) };
  return null;
}

/** Offset → 1-based line, for compilers that report offsets only. */
export function lineIndex(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

export const pascal = (s) => s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());

/** Merges a parseFile() result for one <script> block into the adapter's module (a file may have two blocks). */
export function mergeScript(mod, part) {
  if (part.error) mod.error = part.error;
  for (const k of ['imports', 'exports', 'aliases']) for (const [a, b] of part[k]) mod[k].set(a, b);
  for (const k of ['reexports', 'exportAll', 'routes', 'typeImports']) mod[k].push(...(part[k] ?? []));
  for (const k of ['stores', 'thunks', 'schemas', 'customHooks', 'styleImports', 'unusedImports']) {
    if (part[k]) mod[k] = Array.isArray(part[k]) ? [...(mod[k] ?? []), ...part[k]] : { ...mod[k], ...part[k] };
  }
  if (part.directive) mod.directive = part.directive;
}
