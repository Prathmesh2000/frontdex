import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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
const indexFor = (cat) => indexes.get(cat) ?? indexes.set(cat, createIndex(cat)).get(cat);
const QUERY_FILE = new URL('./query.cjs', import.meta.url);
const UI_FILES = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function dataScript(catalogue, { root = null, history = null, live = false, preview = null } = {}) {
  return `window.__CATALOGUE__ = ${JSON.stringify(catalogue)};\nwindow.__CATALOGUE_ROOT__ = ${JSON.stringify(root)};\nwindow.__CATALOGUE_HISTORY__ = ${JSON.stringify(history)};\nwindow.__CATALOGUE_LIVE__ = ${live};\nwindow.__CATALOGUE_PREVIEW__ = ${JSON.stringify(preview)};\n`;
}

const historyLog = (config) => (config.history.enabled ? createHistory(path.join(knowledgeDir(config), 'history')).log() : null);

export function buildSite(config, catalogue, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of new Set(Object.values(UI_FILES))) fs.copyFileSync(new URL(name, UI_DIR), path.join(outDir, name));
  fs.copyFileSync(QUERY_FILE, path.join(outDir, 'query.js'));
  fs.writeFileSync(path.join(outDir, 'data.js'), dataScript(catalogue, { history: historyLog(config), preview: config.preview }));
}

export function startServer(config, { port, watch, regenerate = true, log = console.log }) {
  const output = path.resolve(config.root, config.output);
  let catalogue = regenerate ? scan(config).catalogue : readCatalogue(output);
  if (!catalogue) throw new Error(`No catalogue at ${output}. Run "frontdex scan" first.`);
  const clients = new Set();
  const broadcast = () => clients.forEach((res) => res.write('data: reload\n\n'));

  const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // The API reads source files and runs git: answer only requests addressed to this machine (blocks DNS rebinding).
    if (url.pathname.startsWith('/api/') && !LOCAL_HOST.test(req.headers.host ?? '')) return res.writeHead(403).end('Forbidden');
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
      return json(res, { total: hits.length, offset, limit, items: hits.slice(offset, offset + limit).map((m) => ({ id: m.id, name: m.name, kind: m.c.kind, file: m.c.file, line: m.c.line, usedBy: m.usedBy, pages: m.pages, issues: m.c.issues?.length ?? 0 })) });
    }
    if (url.pathname === '/api/component') {
      const id = url.searchParams.get('id');
      const c = id && catalogue.components[id];
      return c ? json(res, { id, ...c }) : json(res, { error: `No component "${id}"` }, 404);
    }
    if (url.pathname === '/api/pages') return json(res, catalogue.pages);
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404).end('Not found');
  };
  const server = http.createServer((req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      log(`✖ ${req.url}: ${err.message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal error');
    }
  });

  if (watch) {
    startWatcher(config, {
      log,
      onUpdate: (result) => {
        catalogue = result.catalogue;
        broadcast();
      },
      onSpecEdit: () => {
        catalogue = readCatalogue(output) ?? catalogue;
        log(`↻ ${config.output} edited by hand`);
        broadcast();
      },
    });
  }

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
