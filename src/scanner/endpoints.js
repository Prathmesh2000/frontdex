import path from 'node:path';

/*
 * Server-side entry points the frontend defines: Next.js route handlers (app/**\/route.ts), Pages Router API routes,
 * middleware and server actions ('use server' modules). Remix / React Router resource routes are added by graph.js,
 * since they come out of the file-system routers.
 *
 * Keys: the URL for handlers and API routes, `middleware` for middleware, `action:<name>` for server actions. A key
 * already taken by another workspace gets ` (<workspace>)` appended, the same rule pages follow.
 */

export const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const SOURCE = /\.(tsx|jsx|ts|js|mjs)$/;

export function collectEndpoints({ nextRoots, svelteKitRoots = [], modules, rel, resolveImport, workspaceName }) {
  const endpoints = {};
  const add = (key, entry) => {
    const workspace = workspaceName(entry.file);
    if (workspace) entry.workspace = workspace;
    endpoints[endpoints[key] ? `${key} (${workspace ?? entry.kind})` : key] = { ...entry, file: rel(entry.file) };
  };
  const files = [...modules.keys()];
  const exportsOf = (file) => [...(modules.get(file)?.exports.keys() ?? [])];

  for (const root of nextRoots) {
    for (const appDir of ['app', 'src/app'].map((d) => path.join(root, d))) {
      for (const file of files) {
        if (!file.startsWith(appDir + path.sep) || !/^route\.(tsx|jsx|ts|js)$/.test(path.basename(file))) continue;
        const segs = path.relative(appDir, path.dirname(file)).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
        add('/' + segs.join('/'), { kind: 'route-handler', file, methods: exportsOf(file).filter((e) => HTTP_VERBS.includes(e)) });
      }
    }
    for (const apiDir of ['pages/api', 'src/pages/api'].map((d) => path.join(root, d))) {
      for (const file of files) {
        if (!file.startsWith(apiDir + path.sep)) continue;
        const segs = path.relative(apiDir, file).replace(SOURCE, '').split(path.sep).filter((s) => s !== 'index');
        // A Pages Router API route is one default-exported handler for every method.
        add('/api' + (segs.length ? '/' + segs.join('/') : ''), { kind: 'api-route', file, methods: ['*'] });
      }
    }
    for (const base of [root, path.join(root, 'src')]) {
      const file = files.find((f) => path.dirname(f) === base && /^middleware\.(ts|js)$/.test(path.basename(f)));
      if (file) add('middleware', { kind: 'middleware', file });
    }
  }

  // SvelteKit: +server.ts handlers, and form actions exported by +page.server.ts.
  for (const root of svelteKitRoots) {
    const routesDir = path.join(root, 'src', 'routes');
    for (const file of files) {
      if (!file.startsWith(routesDir + path.sep)) continue;
      const base = path.basename(file);
      const route = '/' + path.relative(routesDir, path.dirname(file)).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s)).join('/');
      if (/^\+server\.(ts|js)$/.test(base)) add(route, { kind: 'route-handler', file, methods: exportsOf(file).filter((e) => HTTP_VERBS.includes(e) || e === 'fallback') });
      else if (/^\+page\.server\.(ts|js)$/.test(base) && exportsOf(file).includes('actions')) add(`action:${route}`, { kind: 'server-action', file });
    }
  }

  // Server actions: every export of a 'use server' module, with the files that import it (one pass over all imports).
  const serverFiles = new Set(files.filter((f) => modules.get(f).directive === 'use server'));
  const importers = new Map();
  if (serverFiles.size) {
    for (const f of files) {
      for (const i of modules.get(f).imports.values()) {
        const target = resolveImport(f, i.source);
        if (!serverFiles.has(target)) continue;
        const key = `${target}#${i.imported}`;
        (importers.get(key) ?? importers.set(key, new Set()).get(key)).add(rel(f));
      }
    }
  }
  for (const file of serverFiles) {
    for (const name of modules.get(file).exports.keys()) {
      if (name === 'default') continue;
      const importedBy = [...new Set([...(importers.get(`${file}#${name}`) ?? []), ...(importers.get(`${file}#*`) ?? [])])].sort();
      add(`action:${name}`, { kind: 'server-action', file, ...(importedBy.length && { importedBy }) });
    }
  }
  return endpoints;
}
