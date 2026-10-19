import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { generate } from './index.js';
import { readCatalogue } from './spec.js';
import { globToRegExp, SOURCE_EXT } from './scanner/files.js';

const UI_DIR = new URL('../ui/', import.meta.url);
const UI_FILES = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export function dataScript(catalogue, root) {
  return `window.__CATALOGUE__ = ${JSON.stringify(catalogue)};\nwindow.__CATALOGUE_ROOT__ = ${JSON.stringify(root ?? null)};\n`;
}

export function buildSite(config, catalogue, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of new Set(Object.values(UI_FILES))) fs.copyFileSync(new URL(name, UI_DIR), path.join(outDir, name));
  fs.writeFileSync(path.join(outDir, 'data.js'), dataScript(catalogue, null));
}

export function startServer(config, { port, watch, regenerate = true, log = console.log }) {
  const output = path.resolve(config.root, config.output);
  let catalogue = regenerate ? generate(config).catalogue : readCatalogue(output);
  if (!catalogue) throw new Error(`No catalogue at ${output}. Run "rcat generate" first.`);
  const clients = new Set();
  const broadcast = () => clients.forEach((res) => res.write('data: reload\n\n'));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (UI_FILES[url.pathname]) {
      const name = UI_FILES[url.pathname];
      res.writeHead(200, { 'content-type': MIME[path.extname(name)], 'cache-control': 'no-store' });
      return fs.createReadStream(new URL(name, UI_DIR)).pipe(res);
    }
    if (url.pathname === '/data.js') {
      res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
      return res.end(dataScript(catalogue, config.root));
    }
    if (url.pathname === '/api/catalogue') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(catalogue));
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
  });

  if (watch) {
    const excludes = config.exclude.map(globToRegExp);
    let timer;
    let lastWrite = 0;
    const rebuild = (reason) => {
      if (reason === 'spec' && Date.now() - lastWrite < 1000) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          if (reason === 'spec') catalogue = readCatalogue(output) ?? catalogue;
          else {
            const result = generate(config);
            catalogue = result.catalogue;
            if (!result.changed) return;
            lastWrite = Date.now();
          }
          log(`↻ catalogue updated (${reason})`);
          broadcast();
        } catch (err) {
          log(`✖ ${err.message}`);
        }
      }, 250);
    };
    fs.watch(config.root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.split(path.sep).join('/');
      if (path.resolve(config.root, filename) === output) return rebuild('spec');
      if (!SOURCE_EXT.includes(path.extname(rel)) || excludes.some((re) => re.test(rel))) return;
      rebuild('source');
    });
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

function serveSource(root, file, res) {
  const abs = file && path.resolve(root, file);
  if (!abs || !abs.startsWith(root + path.sep) || !SOURCE_EXT.includes(path.extname(abs)) || !fs.existsSync(abs)) {
    return res.writeHead(404).end('Not found');
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(fs.readFileSync(abs, 'utf8'));
}
