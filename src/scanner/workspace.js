import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { globToRegExp } from './files.js';

/*
 * Package manager and workspace (monorepo) detection. Workspace packages are what lets `import { Button } from '@acme/ui'`
 * resolve to the UI package's source instead of counting as an external library.
 */

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Which package manager the repo uses: the `packageManager` field wins, then the lockfile. */
export function detectPackageManager(root, pkg = readJson(path.join(root, 'package.json')) ?? {}) {
  const declared = /^(npm|pnpm|yarn|bun)@/.exec(pkg.packageManager ?? '')?.[1];
  const has = (f) => fs.existsSync(path.join(root, f));
  const name = declared ?? (has('pnpm-lock.yaml') ? 'pnpm' : has('bun.lock') || has('bun.lockb') ? 'bun' : has('yarn.lock') ? 'yarn' : has('package-lock.json') ? 'npm' : null);
  if (!name) return null;
  // Yarn 2+ (berry) has .yarnrc.yml; Plug'n'Play installs have .pnp.cjs instead of node_modules.
  if (name === 'yarn' && (has('.yarnrc.yml') || /^yarn@[2-9]/.test(pkg.packageManager ?? ''))) return has('.pnp.cjs') ? 'yarn-pnp' : 'yarn-berry';
  return name;
}

/** Workspace globs from package.json (npm, yarn, bun), pnpm-workspace.yaml and lerna.json. */
function workspaceGlobs(root, pkg) {
  const globs = [];
  const ws = pkg.workspaces;
  globs.push(...(Array.isArray(ws) ? ws : (ws?.packages ?? [])));
  const pnpm = path.join(root, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpm)) {
    try {
      globs.push(...(YAML.parse(fs.readFileSync(pnpm, 'utf8'))?.packages ?? []));
    } catch {}
  }
  globs.push(...(readJson(path.join(root, 'lerna.json'))?.packages ?? []));
  return [...new Set(globs)];
}

const frameworkOf = (pkg) => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  return deps.next ? 'next' : 'react';
};

/**
 * Workspace packages as [{ name, dir (absolute), framework, pkg }], sorted by directory. Empty for a single-package repo.
 * Globs follow the usual workspace syntax: `packages/*`, `apps/**`, and `!pattern` to exclude.
 */
export function detectWorkspaces(root, pkg = readJson(path.join(root, 'package.json')) ?? {}) {
  const globs = workspaceGlobs(root, pkg);
  if (!globs.length) return [];
  const include = globs.filter((g) => !g.startsWith('!')).map((g) => globToRegExp(g.replace(/^\.\//, '').replace(/\/$/, '')));
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => globToRegExp(g.slice(1).replace(/^\.\//, '').replace(/\/$/, '')));
  // Workspace globs are shallow in practice; the depth cap keeps a `**` pattern from crawling the whole repo.
  const maxDepth = Math.max(...globs.map((g) => (g.includes('**') ? 4 : g.split('/').length)));
  const found = [];
  const walk = (dir, rel, depth) => {
    if (depth > maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (include.some((re) => re.test(childRel)) && !exclude.some((re) => re.test(childRel))) {
        const childPkg = readJson(path.join(abs, 'package.json'));
        if (childPkg) found.push({ name: childPkg.name ?? childRel, dir: abs, framework: frameworkOf(childPkg), pkg: childPkg });
      }
      walk(abs, childRel, depth + 1);
    }
  };
  walk(root, '', 1);
  return found.sort((a, b) => a.dir.localeCompare(b.dir));
}

/** The workspace package containing `file`, or null. `workspaces` must be sorted by directory (deepest match wins). */
export function workspaceOf(workspaces, file) {
  let hit = null;
  for (const w of workspaces) if ((file === w.dir || file.startsWith(w.dir + path.sep)) && (!hit || w.dir.length > hit.dir.length)) hit = w;
  return hit;
}
