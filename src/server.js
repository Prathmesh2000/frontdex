import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHistory } from './history.js';
import { knowledgeDir, scan } from './index.js';
import { SOURCE_EXT } from './scanner/files.js';
import { readCatalogue } from './spec.js';
import { startWatcher } from './watch.js';

const UI_DIR = new URL('../ui/', import.meta.url);
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
    server.listen(port, () => resolve(server));
  });
}

function json(res, data) {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
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
