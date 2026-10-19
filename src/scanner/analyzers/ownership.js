import fs from 'node:fs';
import path from 'node:path';
import { globToRegExp } from '../files.js';

/*
 * Who owns a component and whether it is tested: CODEOWNERS rules (GitHub/GitLab syntax, last match wins) and test or
 * story files next to the component (Button.test.tsx, __tests__/Button.tsx, Button.stories.tsx). Both are facts of the
 * source tree, so they are stable enough to live in the catalogue; git activity and coverage are not, and stay CLI-only.
 */

const CODEOWNERS = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS', '.gitlab/CODEOWNERS'];

/** Parses the first CODEOWNERS file found under `root` into a matcher: rel path → owners[] (or null). */
export function codeownersMatcher(root) {
  const file = CODEOWNERS.map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!file) return null;
  const rules = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!owners.length) continue;
    // Unanchored patterns match at any depth; a trailing slash means "everything inside"; a bare name may be a folder.
    let glob = pattern.startsWith('/') ? pattern.slice(1) : `**/${pattern}`;
    if (pattern === '*') glob = '**';
    const res = glob.endsWith('/') ? [globToRegExp(`${glob}**`)] : [globToRegExp(glob), globToRegExp(`${glob}/**`)];
    rules.push({ res, owners });
  }
  return (rel) => {
    let hit = null;
    for (const r of rules) if (r.res.some((re) => re.test(rel))) hit = r.owners;
    return hit;
  };
}

/** Test and story files for a component file, as paths relative to the component's folder. */
export function testsAndStories(absFile, listDir) {
  const dir = path.dirname(absFile);
  const base = path.basename(absFile).replace(/\.[^.]+$/, '');
  const tests = [];
  const stories = [];
  for (const [folder, prefix] of [[dir, ''], [path.join(dir, '__tests__'), '__tests__/']]) {
    for (const name of listDir(folder)) {
      if (!name.startsWith(`${base}.`) && !(prefix && name.replace(/\.[^.]+$/, '') === base)) continue;
      if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || (prefix && /\.[cm]?[jt]sx?$/.test(name))) tests.push(prefix + name);
      else if (/\.stories\.[cm]?[jt]sx?$|\.stories\.(svelte|vue|mdx)$/.test(name)) stories.push(prefix + name);
    }
  }
  return { tests, stories };
}

/** Directory listing with a per-scan cache, for testsAndStories. */
export function cachedLister() {
  const cache = new Map();
  return (dir) => {
    if (!cache.has(dir)) {
      try {
        cache.set(dir, fs.readdirSync(dir));
      } catch {
        cache.set(dir, []);
      }
    }
    return cache.get(dir);
  };
}
