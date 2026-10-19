import path from 'node:path';

/*
 * File-system routers other than Next.js (which graph.js handles): Remix v2 flat routes, React Router v7 framework mode
 * (app/routes.ts and flatRoutes), TanStack Router, Gatsby, SolidStart, Qwik City and Nuxt.
 *
 * Each router returns route descriptors that graph.js turns into pages:
 *   { route, router, file, params, page: Ref, layouts: Ref[] }   Ref = { file, export: 'default' } | { file, local }
 * Routes keep their router's own syntax for params (`:id` for Remix/React Router, `$id` for TanStack, `[id]` for
 * Gatsby/Solid/Qwik), the same convention Next.js pages follow with `[id]`.
 */

const SOURCE = /\.(tsx|jsx|ts|js|mjs|vue|svelte)$/;
const stripExt = (f) => f.replace(SOURCE, '');

/** Splits a flat-route file name on dots, except dots escaped in [brackets] (`sitemap[.]xml`). */
function splitDots(name) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of name) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === '.' && !depth) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const routeOf = (segments) => '/' + segments.filter((s) => s !== '').join('/');
const firstExisting = (files, base) => [...files].find((f) => stripExt(f) === base);

/**
 * Remix v2 flat routes (also React Router's flatRoutes()): `app/routes/dashboard.$id.tsx` or
 * `app/routes/dashboard.$id/route.tsx`. `_index` is an index route, a leading `_` is a pathless layout, a trailing `_`
 * opts out of the parent layout, `$id` → `:id`, `$` → `*`, `($lang)` → `:lang?`.
 */
function flatRoutes(routesDir, files, { router, rootLayouts = [], prefix = [] }) {
  const byName = new Map();
  for (const file of files) {
    if (!file.startsWith(routesDir + path.sep)) continue;
    const rel = path.relative(routesDir, file).split(path.sep);
    if (rel.length === 1) byName.set(stripExt(rel[0]), file);
    else if (rel.length === 2 && /^route\.(tsx|jsx|ts|js)$/.test(rel[1])) byName.set(rel[0], file);
  }
  const out = [];
  for (const [name, file] of byName) {
    const raw = splitDots(name);
    const last = raw[raw.length - 1];
    const isIndex = last === '_index';
    if (!isIndex && last.startsWith('_')) continue; // pathless layout: only a parent of other routes
    // A parent route with an index child is a layout; the index child is the page at that URL.
    if (!isIndex && byName.has(`${name}._index`)) continue;
    const segments = [];
    for (const seg of raw) {
      if (seg === '_index' || seg.startsWith('_')) continue;
      let s = seg.replace(/_$/, '').replace(/\[(.*?)\]/g, '$1');
      if (s === '$') s = '*';
      else if (/^\(\$(.+)\)$/.test(s)) s = `:${s.slice(2, -1)}?`;
      else if (/^\((.+)\)$/.test(s)) s = `${s.slice(1, -1)}?`;
      else if (s.startsWith('$')) s = `:${s.slice(1)}`;
      segments.push(s);
    }
    const layouts = [...rootLayouts];
    for (let k = 1; k < raw.length; k++) {
      const parent = raw.slice(0, k).join('.');
      if (byName.has(parent)) layouts.push({ file: byName.get(parent), export: 'default' });
    }
    const all = [...prefix, ...segments];
    out.push({ route: routeOf(all), router, file, params: params(all), page: { file, export: 'default' }, layouts });
  }
  return out;
}

const params = (segments) =>
  segments.flatMap((s) => {
    const m = /^:(\w+)\??$/.exec(s) ?? /^\$(\w+)$/.exec(s) ?? /^\[{1,2}(?:\.\.\.)?(\w+)\]{1,2}$/.exec(s) ?? /^\{[\w$]+\.(\w+)\}$/.exec(s);
    return m ? [m[1]] : s === '*' || s === '$' ? ['*'] : [];
  });

/** React Router v7 app/routes.ts: route(), index(), layout(), prefix() and `...(await flatRoutes())`. */
function configRoutes(appDir, config, files, rootLayouts) {
  const out = [];
  const abs = (f) => f && firstExisting(files, stripExt(path.resolve(appDir, f)));
  const walk = (list, prefix, layouts) => {
    for (const r of list) {
      if (r.flat) out.push(...flatRoutes(path.join(appDir, 'routes'), files, { router: 'react-router-v7', rootLayouts: layouts, prefix }));
      else if (r.prefix !== undefined) walk(r.children ?? [], [...prefix, ...r.prefix.split('/')], layouts);
      else if (r.layout) {
        const file = abs(r.file);
        walk(r.children ?? [], prefix, file ? [...layouts, { file, export: 'default' }] : layouts);
      } else {
        const file = abs(r.file);
        const segs = r.index ? prefix : [...prefix, ...(r.path ?? '').split('/')];
        const kids = r.children ?? [];
        if (file && !kids.some((k) => k.index)) out.push({ route: routeOf(segs), router: 'react-router-v7', file, params: params(segs), page: { file, export: 'default' }, layouts });
        if (kids.length) walk(kids, segs, file ? [...layouts, { file, export: 'default' }] : layouts);
      }
    }
  };
  walk(config, [], rootLayouts);
  return out;
}

/** Remix and React Router v7 framework mode: app/root is the root layout; app/routes.ts wins over flat routes. */
function remixLike(app, files, modules, router) {
  const appDir = path.join(app.dir, 'app');
  const root = firstExisting(files, path.join(appDir, 'root'));
  const rootLayouts = root ? [{ file: root, export: 'default' }] : [];
  const config = router === 'react-router-v7' && ['routes.ts', 'routes.js', 'routes.tsx'].map((f) => modules.get(path.join(appDir, f))).find((m) => m?.routeConfig);
  if (config) return configRoutes(appDir, config.routeConfig, files, rootLayouts);
  return flatRoutes(path.join(appDir, 'routes'), files, { router, rootLayouts });
}

/**
 * TanStack Router file routes. The path comes from createFileRoute('/posts/$id') when present, otherwise from the file
 * name (dots or folders as separators, `index`, `route.tsx`, `__root`, `-` ignored, `(group)` dropped). Segments with a
 * leading `_` are pathless layouts; a trailing `_` leaves the parent layout.
 */
function tanstack(app, files, modules) {
  const out = [];
  for (const base of ['src/routes', 'app/routes']) {
    const routesDir = path.join(app.dir, base);
    const routes = [];
    let root = null;
    for (const file of files) {
      if (!file.startsWith(routesDir + path.sep)) continue;
      const fr = modules.get(file)?.fileRoute;
      if (!fr) continue;
      if (fr.root) {
        root = fr.component ? { file, local: fr.component } : null;
        continue;
      }
      const rawPath = fr.path ?? derivedTanstackPath(path.relative(routesDir, file));
      if (rawPath == null || !fr.component) continue;
      routes.push({ file, raw: rawPath.split('/').filter(Boolean), index: rawPath.endsWith('/') && rawPath !== '/' ? true : rawPath === '/', ref: { file, local: fr.component } });
    }
    const key = (r) => r.raw.join('/');
    for (const r of routes) {
      const last = r.raw[r.raw.length - 1] ?? '';
      if (!r.index && last.startsWith('_')) continue;
      if (!r.index && routes.some((o) => o.index && key(o) === key(r))) continue;
      // Parents: routes whose segments are a strict prefix of this one's; an index route (`/posts/`) also sits under `/posts`.
      const isPrefix = (o) => o.raw.length < r.raw.length && o.raw.every((s, i) => s === r.raw[i]);
      const parents = routes.filter((o) => o !== r && !o.index && (isPrefix(o) || (r.index && key(o) === key(r)))).sort((a, b) => a.raw.length - b.raw.length);
      const url = r.raw.filter((s) => !s.startsWith('_')).map((s) => s.replace(/_$/, ''));
      out.push({ route: routeOf(url), router: 'tanstack', file: r.file, params: params(url), page: r.ref, layouts: [...(root ? [root] : []), ...parents.map((p) => p.ref)] });
    }
  }
  return out;
}

function derivedTanstackPath(rel) {
  const parts = stripExt(rel).split(path.sep).flatMap((p) => splitDots(p));
  if (parts.some((p) => p.startsWith('-')) || parts[0] === '__root') return null;
  const segs = parts.filter((p) => p !== 'route' && !/^\(.*\)$/.test(p));
  const index = segs[segs.length - 1] === 'index';
  const clean = index ? segs.slice(0, -1) : segs;
  return '/' + clean.join('/') + (index && clean.length ? '/' : '');
}

/** Gatsby: every file in src/pages is a page (`index` → folder URL, `{Product.slug}` and `[id]` are params). */
function gatsby(app, files) {
  const pagesDir = path.join(app.dir, 'src', 'pages');
  const out = [];
  for (const file of files) {
    if (!file.startsWith(pagesDir + path.sep)) continue;
    const segs = stripExt(path.relative(pagesDir, file)).split(path.sep);
    if (segs.some((s) => s.startsWith('_'))) continue;
    if (segs[segs.length - 1] === 'index') segs.pop();
    out.push({ route: routeOf(segs), router: 'gatsby', file, params: params(segs), page: { file, export: 'default' }, layouts: [] });
  }
  return out;
}

/**
 * Nested file routes (SolidStart src/routes, Nuxt pages/): `index` → folder URL, `(group)` dropped. `users.tsx` next to
 * a `users/` folder is the layout for the routes inside it (and a page itself only when the folder has no index).
 * `rootLayouts` wrap every page (SolidStart src/app, Nuxt app.vue + layouts/default.vue).
 */
function nestedFileRoutes(routesDir, files, router, rootLayouts) {
  const routeFiles = [...files].filter((f) => f.startsWith(routesDir + path.sep));
  const out = [];
  for (const file of routeFiles) {
    const rel = stripExt(path.relative(routesDir, file));
    const folder = path.join(routesDir, rel);
    const isLayout = routeFiles.some((f) => f.startsWith(folder + path.sep));
    if (isLayout && routeFiles.some((f) => stripExt(f) === path.join(folder, 'index'))) continue;
    const parts = rel.split(path.sep);
    const layouts = [...rootLayouts];
    for (let k = 1; k < parts.length; k++) {
      const layout = firstExisting(routeFiles, path.join(routesDir, ...parts.slice(0, k)));
      if (layout) layouts.push({ file: layout, export: 'default' });
    }
    const segs = parts.filter((p) => !/^\(.*\)$/.test(p));
    if (segs[segs.length - 1] === 'index') segs.pop();
    out.push({ route: routeOf(segs), router, file, params: params(segs), page: { file, export: 'default' }, layouts });
  }
  return out;
}

function solidStart(app, files) {
  const appFile = firstExisting(files, path.join(app.dir, 'src', 'app'));
  return nestedFileRoutes(path.join(app.dir, 'src', 'routes'), files, 'solid-start', appFile ? [{ file: appFile, export: 'default' }] : []);
}

/** Nuxt 3 (pages/, layouts/, app.vue) and Nuxt 4 (the same under app/). Only the default layout is applied. */
function nuxt(app, files) {
  for (const base of ['app', '.']) {
    const dir = path.join(app.dir, base);
    const pagesDir = path.join(dir, 'pages');
    if (![...files].some((f) => f.startsWith(pagesDir + path.sep))) continue;
    const roots = [firstExisting(files, path.join(dir, 'app')), firstExisting(files, path.join(dir, 'layouts', 'default'))].filter(Boolean);
    return nestedFileRoutes(pagesDir, files, 'nuxt', roots.map((file) => ({ file, export: 'default' })));
  }
  return [];
}

/** Qwik City: src/routes/**\/index.tsx are pages; layout.tsx in each ancestor folder wraps them. */
function qwikCity(app, files) {
  const routesDir = path.join(app.dir, 'src', 'routes');
  const routeFiles = [...files].filter((f) => f.startsWith(routesDir + path.sep));
  const out = [];
  for (const file of routeFiles) {
    if (!/^index\.(tsx|jsx|ts|js)$/.test(path.basename(file))) continue;
    const dirs = path.relative(routesDir, path.dirname(file)).split(path.sep).filter(Boolean);
    const layouts = [];
    for (let k = 0; k <= dirs.length; k++) {
      const layout = firstExisting(routeFiles, path.join(routesDir, ...dirs.slice(0, k), 'layout'));
      if (layout) layouts.push({ file: layout, export: 'default' });
    }
    const segs = dirs.filter((p) => !/^\(.*\)$/.test(p));
    out.push({ route: routeOf(segs), router: 'qwik-city', file, params: params(segs), page: { file, export: 'default' }, layouts });
  }
  return out;
}

/**
 * SvelteKit: src/routes/**\/+page.svelte are pages; +layout.svelte in each folder from the routes root down wraps them.
 * `(group)` folders are dropped, `[id]`, `[[optional]]` and `[...rest]` kept.
 */
function svelteKit(app, files) {
  const routesDir = path.join(app.dir, 'src', 'routes');
  const routeFiles = [...files].filter((f) => f.startsWith(routesDir + path.sep));
  const out = [];
  for (const file of routeFiles) {
    if (!/^\+page(@[\w-]*)?\.svelte$/.test(path.basename(file))) continue;
    const dirs = path.relative(routesDir, path.dirname(file)).split(path.sep).filter(Boolean);
    const layouts = [];
    for (let k = 0; k <= dirs.length; k++) {
      const layout = routeFiles.find((f) => f === path.join(routesDir, ...dirs.slice(0, k), '+layout.svelte'));
      if (layout) layouts.push({ file: layout, export: 'default' });
    }
    const segs = dirs.filter((p) => !/^\(.*\)$/.test(p));
    out.push({ route: routeOf(segs), router: 'sveltekit', file, params: params(segs), page: { file, export: 'default' }, layouts });
  }
  return out;
}

/** Runs every router whose package is a dependency of the app root. `app = { dir, deps }`. */
export function fileSystemRoutes(app, files, modules) {
  const has = (...names) => names.some((n) => app.deps?.[n]);
  const out = [];
  if (has('@react-router/dev')) out.push(...remixLike(app, files, modules, 'react-router-v7'));
  else if (has('@remix-run/dev', '@remix-run/react')) out.push(...remixLike(app, files, modules, 'remix'));
  if (has('@tanstack/react-router', '@tanstack/react-start', '@tanstack/start')) out.push(...tanstack(app, files, modules));
  if (has('gatsby')) out.push(...gatsby(app, files));
  if (has('@solidjs/start')) out.push(...solidStart(app, files));
  if (has('@builder.io/qwik-city')) out.push(...qwikCity(app, files));
  if (has('nuxt')) out.push(...nuxt(app, files));
  if (has('@sveltejs/kit')) out.push(...svelteKit(app, files));
  return out;
}
