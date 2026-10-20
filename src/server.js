import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildReport, catalogueAtRef } from './ci.js';
import { createHistory } from './history.js';
import { knowledgeDir, scan } from './index.js';
import { SOURCE_EXT } from './scanner/files.js';
import { readCatalogue } from './spec.js';
import { startWatcher } from './watch.js';

const UI_DIR = new URL('../ui/', import.meta.url);
const { createIndex } = createRequire(import.meta.url)('./query.cjs');
// One query index per catalogue object, rebuilt only after a rescan replaces the catalogue.
const indexes = new WeakMap();
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const OVERLAY_FILE = new URL('./overlay/overlay.js', import.meta.url);
const isLoopback = (address) => address === '::1' || /^(::ffff:)?127\./.test(address ?? '');
const indexFor = (cat) => indexes.get(cat) ?? indexes.set(cat, createIndex(cat)).get(cat);
const QUERY_FILE = new URL('./query.cjs', import.meta.url);
const UI_FILES = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const V2_DIR = new URL('../ui-react/dist/', import.meta.url);

export function dataScript(catalogue, { root = null, history = null, live = false, preview = null } = {}) {
  return `window.__CATALOGUE__ = ${JSON.stringify(catalogue)};\nwindow.__CATALOGUE_ROOT__ = ${JSON.stringify(root)};\nwindow.__CATALOGUE_HISTORY__ = ${JSON.stringify(history)};\nwindow.__CATALOGUE_LIVE__ = ${live};\nwindow.__CATALOGUE_PREVIEW__ = ${JSON.stringify(preview)};\n`;
}

/**
 * The slice of the render graph the v2 graph view draws, so the browser never loads the whole catalogue.
 * `focus` is "c:<component id>" or "p:<route>" and walks `depth` hops both ways; `dir` takes a folder;
 * neither takes everything. Past `max` nodes only the counts come back, unless `force` is set.
 */
export function subgraph(catalogue, { focus, depth = 2, dir, max = 400, force = false } = {}) {
  const C = catalogue.components;
  const P = catalogue.pages ?? {};
  const roots = (r) => [...(P[r].layouts ?? []), P[r].component].filter(Boolean);
  let routes;
  let ids;
  if (focus) {
    routes = new Set();
    ids = new Set();
    const seen = new Set([focus]);
    let frontier = [focus];
    for (let d = 0; d <= depth && frontier.length; d++) {
      const next = [];
      for (const key of frontier) {
        const id = key.slice(2);
        if (key.startsWith('p:') && P[id]) {
          routes.add(id);
          if (d < depth) next.push(...roots(id).map((x) => `c:${x}`));
        } else if (key.startsWith('c:') && C[id]) {
          ids.add(id);
          if (d < depth) {
            next.push(...(C[id].renders ?? []).map((x) => `c:${x}`), ...(C[id].usedBy ?? []).map((x) => `c:${x}`));
            for (const r of Object.keys(P)) if (roots(r).includes(id)) next.push(`p:${r}`);
          }
        }
      }
      frontier = next.filter((k) => !seen.has(k) && seen.add(k));
    }
    routes = [...routes];
    ids = [...ids];
  } else {
    ids = Object.keys(C).filter((id) => !dir || C[id].file.startsWith(`${dir}/`));
    const set = new Set(ids);
    routes = Object.keys(P).filter((r) => !dir || roots(r).some((x) => set.has(x)));
  }
  const total = ids.length + routes.length;
  if (total > max && !force) return { total, truncated: true, pages: {}, nodes: {} };
  const set = new Set(ids);
  const keep = (list) => (list ?? []).filter((x) => set.has(x));
  return {
    total,
    truncated: false,
    pages: Object.fromEntries(routes.map((r) => [r, { component: set.has(P[r].component) ? P[r].component : undefined, layouts: keep(P[r].layouts) }])),
    nodes: Object.fromEntries(ids.map((id) => [id, { name: C[id].name, file: C[id].file, renders: keep(C[id].renders), usedBy: keep(C[id].usedBy) }])),
  };
}

/** A file of the React UI (ui-react, pre-built at publish time); `pathname` is relative to where the UI is mounted. */
function serveV2(pathname, res) {
  // resolve() drops the trailing separator a directory URL carries, so the containment check below holds.
  const dist = path.resolve(fileURLToPath(V2_DIR));
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(dist, rel);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end('Not found (build it with: npm run build:ui)');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': rel === 'index.html' ? 'no-store' : 'max-age=31536000, immutable' });
  fs.createReadStream(file).pipe(res);
}

const componentRow = (m) => ({ id: m.id, name: m.name, kind: m.c.kind, file: m.c.file, line: m.c.line, usedBy: m.usedBy, pages: m.pages, issues: m.c.issues?.length ?? 0 });

const historyLog = (config) => (config.history.enabled ? createHistory(path.join(knowledgeDir(config), 'history')).log() : null);

export function buildSite(config, catalogue, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of new Set(Object.values(UI_FILES))) fs.copyFileSync(new URL(name, UI_DIR), path.join(outDir, name));
  fs.copyFileSync(QUERY_FILE, path.join(outDir, 'query.js'));
  fs.writeFileSync(path.join(outDir, 'data.js'), dataScript(catalogue, { history: historyLog(config), preview: config.preview }));
}

/**
 * The UI and HTTP API as a plain (req, res) handler with paths relative to where it is mounted: `frontdex serve` puts it
 * at the root of its own server, the Vite plugin under /__frontdex/ on the dev server. `close()` stops the watcher.
 */
export function createApp(config, { watch, regenerate = true, log = console.log, allowLan = !!process.env.FRONTDEX_HOST, livePreview = null }) {
  const output = path.resolve(config.root, config.output);
  const clients = new Set();
  let settling = false;
  const broadcast = () => clients.forEach((res) => res.write('data: reload\n\n'));
  // With watch on, the watcher's own first scan is the catalogue: one scan at start, and a warm session for fast patches.
  const watcher =
    watch &&
    startWatcher(config, {
      log,
      onUpdate: (result) => {
        catalogue = result.catalogue;
        // A fast patch is current per component; project-wide findings follow with the settling scan (see watch.js).
        settling = !!result.fast;
        broadcast();
      },
      onSpecEdit: () => {
        catalogue = readCatalogue(output) ?? catalogue;
        log(`↻ ${config.output} edited by hand`);
        broadcast();
      },
    });
  let catalogue = watcher ? watcher.initial.catalogue : regenerate ? scan(config).catalogue : readCatalogue(output);
  if (!catalogue) throw new Error(`No catalogue at ${output}. Run "frontdex scan" first.`);

  const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Relative, so it also lands right when the app is mounted under a prefix.
    if (url.pathname === '/classic') return res.writeHead(301, { location: 'classic/' }).end();
    // The classic UI lives under /classic/: drop the prefix so its relative URLs (app.js, data.js, api/…) reach the
    // same handlers as before.
    const classic = url.pathname.startsWith('/classic/');
    if (classic) url.pathname = url.pathname.slice('/classic'.length);
    // The API reads source files and runs git: answer only requests addressed to this machine (blocks DNS rebinding).
    // The API (source, git) and data.js (the whole catalogue) answer this machine only. Two checks: the Host header stops
    // DNS rebinding from a browser; the socket peer stops another machine, which can send any Host it likes, when the
    // app is mounted on a dev server bound to the LAN (vite --host). allowLan is the explicit opt-out.
    if ((url.pathname.startsWith('/api/') || url.pathname === '/data.js') && (!LOCAL_HOST.test(req.headers.host ?? '') || (!allowLan && !isLoopback(req.socket?.remoteAddress)))) {
      return res.writeHead(403).end('Forbidden');
    }
    // The dev overlay runs inside the app (another localhost port) and asks the API where components live.
    if (url.pathname.startsWith('/api/') && LOCAL_ORIGIN.test(req.headers.origin ?? '')) res.setHeader('access-control-allow-origin', req.headers.origin);
    if (url.pathname === '/overlay.js') {
      res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
      return fs.createReadStream(OVERLAY_FILE).pipe(res);
    }
    // The React UI is the default at / once built (and stays reachable at /v2/); a checkout without a build gets the classic UI.
    if (!classic && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')) && fs.existsSync(new URL('index.html', V2_DIR))) return serveV2(url.pathname, res);
    if (url.pathname === '/v2' || url.pathname.startsWith('/v2/')) return serveV2(url.pathname.slice(3), res);
    if (UI_FILES[url.pathname] || url.pathname === '/query.js') {
      const name = UI_FILES[url.pathname] ?? 'query.js';
      const src = url.pathname === '/query.js' ? QUERY_FILE : new URL(name, UI_DIR);
      res.writeHead(200, { 'content-type': MIME[path.extname(name)], 'cache-control': 'no-store' });
      return fs.createReadStream(src).pipe(res);
    }
    if (url.pathname === '/data.js') {
      res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
      return res.end(dataScript(catalogue, { root: config.root, history: historyLog(config), live: !!watch, preview: config.preview }));
    }
    if (url.pathname === '/api/catalogue') return json(res, catalogue);
    if (url.pathname === '/api/history') return json(res, historyLog(config) ?? []);
    if (url.pathname === '/api/rescan' && req.method === 'POST') {
      const result = scan(config, { message: 'manual rescan (UI)' });
      catalogue = result.catalogue;
      if (result.changed) broadcast();
      return json(res, { changed: result.changed, delta: result.delta, commit: result.commit, warnings: result.warnings });
    }
    if (url.pathname === '/api/source') return serveSource(config.root, url.searchParams.get('file'), res);
    if (url.pathname === '/api/diff') {
      try {
        const base = url.searchParams.get('base') || 'HEAD';
        const head = url.searchParams.get('head');
        const before = catalogueAtRef(config, base).catalogue;
        const after = head ? catalogueAtRef(config, head).catalogue : catalogue;
        return json(res, buildReport(before, after, { baseLabel: base, headLabel: head ?? 'working tree' }));
      } catch (err) {
        return json(res, { error: `Cannot diff: ${String(err.message).split('\n')[0]}` }, 400);
      }
    }
    // Paged access for large projects and external tools: /api/components?q=uses:Button&offset=0&limit=50
    if (url.pathname === '/api/components') {
      const index = indexFor(catalogue);
      const q = url.searchParams.get('q') ?? '';
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 50));
      const hits = q ? index.run(q) : index.comps;
      return json(res, { total: hits.length, offset, limit, items: hits.slice(offset, offset + limit).map(componentRow) });
    }
    // One folder level at a time: subfolders with component counts, plus the components directly inside.
    if (url.pathname === '/api/folders') {
      const dir = (url.searchParams.get('path') ?? '').replace(/^\/+|\/+$/g, '');
      const prefix = dir ? `${dir}/` : '';
      const dirs = new Map();
      const items = [];
      for (const m of indexFor(catalogue).comps) {
        if (!m.c.file.startsWith(prefix)) continue;
        const rest = m.c.file.slice(prefix.length);
        const name = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : null;
        if (!name) {
          items.push(componentRow(m));
          continue;
        }
        const d = dirs.get(name) ?? dirs.set(name, { name, path: prefix + name, count: 0, withIssues: 0 }).get(name);
        d.count++;
        if (m.c.issues?.length) d.withIssues++;
      }
      return json(res, { path: dir, dirs: [...dirs.values()].sort((a, b) => a.name.localeCompare(b.name)), items });
    }
    if (url.pathname === '/api/component') {
      // Links and agents may still hold an old id; the catalogue's aliases map it to where the component lives now.
      const asked = url.searchParams.get('id');
      const id = asked && !Object.hasOwn(catalogue.components, asked) && Object.hasOwn(catalogue.aliases ?? {}, asked) ? catalogue.aliases[asked] : asked;
      const c = id && Object.hasOwn(catalogue.components, id) && catalogue.components[id];
      return c ? json(res, { id, ...c }) : json(res, { error: `No component "${id}"` }, 404);
    }
    if (url.pathname === '/api/pages') return json(res, catalogue.pages);
    if (url.pathname === '/api/graph') {
      const p = url.searchParams;
      return json(res, subgraph(catalogue, { focus: p.get('focus') || undefined, depth: Math.min(8, Math.max(1, Number(p.get('depth')) || 2)), dir: p.get('dir') || undefined, force: p.get('force') === '1' }));
    }
    if (url.pathname === '/api/info') {
      const count = (x) => (Array.isArray(x) ? x.length : x ? Object.keys(x).length : 0);
      return json(res, {
        info: catalogue.info,
        root: config.root,
        preview: config.preview,
        counts: { components: count(catalogue.components), pages: count(catalogue.pages), stores: count(catalogue.stores), hooks: count(catalogue.hooks), endpoints: count(catalogue.endpoints), tokens: count(catalogue.tokens?.definitions), duplicates: count(catalogue.duplicates) },
        issues: catalogue.health?.issues ?? {},
        settling,
        // Path (relative to the app) of the per-component live preview; only the Vite plugin can render one.
        livePreview,
      });
    }
    // Whole sections that stay small (tokens, hooks, stores …); components and issues are paged instead.
    const SECTIONS = { tokens: 1, duplicates: 1, hooks: 1, stores: 1, endpoints: 1, styles: 1, health: 1 };
    if (url.pathname === '/api/section') {
      const name = url.searchParams.get('name');
      return SECTIONS[name] ? json(res, catalogue[name] ?? null) : json(res, { error: `Unknown section "${name}"` }, 400);
    }
    if (url.pathname === '/api/issues') {
      const severity = url.searchParams.get('severity');
      const type = url.searchParams.get('type');
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
      const order = ['high', 'medium', 'low', 'info'];
      const all = Object.entries(catalogue.components)
        .flatMap(([id, c]) => (c.issues ?? []).map((i) => ({ component: id, file: c.file, ...i })))
        .filter((i) => (!severity || i.severity === severity) && (!type || i.type === type))
        .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
      return json(res, { total: all.length, offset, limit, items: all.slice(offset, offset + limit) });
    }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404).end('Not found');
  };
  return {
    handler: (req, res) => {
      try {
        handler(req, res);
      } catch (err) {
        log(`✖ ${req.url}: ${err.message}`);
        if (!res.headersSent) res.writeHead(500);
        res.end('Internal error');
      }
    },
    close: () => watcher?.close(),
  };
}

export function startServer(config, { port, watch, regenerate = true, log = console.log }) {
  const app = createApp(config, { watch, regenerate, log });
  const server = http.createServer(app.handler);
  server.once('close', app.close);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Loopback only by default: the UI exposes source code. FRONTDEX_HOST=0.0.0.0 opts into LAN access.
    server.listen(port, process.env.FRONTDEX_HOST || '127.0.0.1', () => resolve(server));
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function serveSource(root, file, res) {
  const abs = file && path.resolve(root, file);
  if (!abs || !abs.startsWith(root + path.sep) || !SOURCE_EXT.includes(path.extname(abs)) || !fs.existsSync(abs)) {
    return res.writeHead(404).end('Not found');
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(fs.readFileSync(abs, 'utf8'));
}
