import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('vite plugin serves the UI and API at /__frontdex/ on the dev server', async () => {
  const { createServer } = await import('vite');
  const { default: frontdex } = await import('../src/plugins/vite.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/react-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$|node_modules/.test(src) });
  const server = await createServer({ root: dir, configFile: false, logLevel: 'silent', plugins: [frontdex()], server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}/__frontdex`;
    const bare = await fetch(base, { redirect: 'manual' });
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/__frontdex/');
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const info = await (await fetch(`${base}/api/info`)).json();
    assert.equal(info.info.title, 'Acme Admin');
    assert.ok(info.counts.components > 0);
    // A host other than this machine is refused: the dev server may be bound to the LAN.
    // fetch() drops a custom Host header, so this one goes through http.request.
    const status = await new Promise((resolve, reject) =>
      http.get({ host: '127.0.0.1', port: server.httpServer.address().port, path: '/__frontdex/api/info', headers: { host: 'evil.example:5173' } }, (res) => resolve(res.statusCode)).on('error', reject),
    );
    assert.equal(status, 403);
  } finally {
    await server.close();
  }
});

test('webpack/rspack plugin starts the watcher only in watch mode', () => {
  const FrontdexPlugin = require('../src/plugins/webpack.cjs');
  assert.equal(require('../src/plugins/webpack.cjs').FrontdexPlugin, FrontdexPlugin);
  const taps = {};
  const compiler = { hooks: { watchRun: { tap: (_n, fn) => (taps.watchRun = fn) }, watchClose: { tap: (_n, fn) => (taps.watchClose = fn) } } };
  new FrontdexPlugin().apply(compiler);
  assert.equal(typeof taps.watchRun, 'function', 'a one-off build never calls watchRun, so nothing starts');
  // With a watcher already running in this process tree (the inherited flag), watch mode starts no second one.
  process.env.RCAT_WATCHER = '1';
  try {
    taps.watchRun();
    taps.watchClose();
    assert.equal(process.env.RCAT_WATCHER, '1', 'closing does not clear a flag it did not set');
  } finally {
    delete process.env.RCAT_WATCHER;
  }
  const off = { hooks: { watchRun: { tap: () => assert.fail('disabled plugin taps nothing') }, watchClose: { tap: () => {} } } };
  new FrontdexPlugin({ enabled: false }).apply(off);
});

test('the API answers this machine only: a LAN peer is refused even with a localhost Host header', async () => {
  const { createApp } = await import('../src/server.js');
  const { loadConfig } = await import('../src/index.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/react-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$/.test(src) });
  const config = { ...loadConfig(dir), history: { enabled: false, limit: 0 }, agents: { enabled: false } };
  const call = (app, { peer, origin, url = '/api/info' }) => {
    const res = { status: 200, headers: {}, setHeader: (k, v) => (res.headers[k] = v), writeHead: (s, h) => ((res.status = s), Object.assign(res.headers, h), res), end: () => res, write: () => true, on: () => res, once: () => res, emit: () => true };
    app.handler({ url, headers: { host: 'localhost:5173', ...(origin && { origin }) }, socket: { remoteAddress: peer } }, res);
    return res;
  };
  const app = createApp(config, { watch: false, log: () => {} });
  assert.equal(call(app, { peer: '192.168.1.20' }).status, 403);
  assert.equal(call(app, { peer: '192.168.1.20', url: '/data.js' }).status, 403);
  assert.equal(call(app, { peer: '::ffff:127.0.0.1' }).status, 200);
  assert.equal(call(app, { peer: '127.0.0.1', origin: 'http://localhost:3000' }).headers['access-control-allow-origin'], 'http://localhost:3000');
  assert.equal(call(app, { peer: '127.0.0.1', origin: 'https://evil.example' }).headers['access-control-allow-origin'], undefined);
  assert.equal(call(createApp(config, { watch: false, log: () => {}, allowLan: true }), { peer: '192.168.1.20' }).status, 200, 'allowLan opts in');
});

test('vite plugin with overlay: true injects the overlay script, which frontdex serves', async () => {
  const { createServer } = await import('vite');
  const { default: frontdex } = await import('../src/plugins/vite.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-ov-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/react-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$/.test(src) });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
  const server = await createServer({ root: dir, configFile: false, logLevel: 'silent', plugins: [frontdex({ overlay: true })], server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    assert.match(await (await fetch(`${base}/`)).text(), /<script type="module" src="\/__frontdex\/overlay\.js"><\/script>/);
    const script = await fetch(`${base}/__frontdex/overlay.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /export function start/);
  } finally {
    await server.close();
  }
});

test('vite plugin serves a live preview page for React components (Fast Refresh preamble, virtual entry)', async () => {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { default: frontdex } = await import('../src/plugins/vite.js');
  // Inside the repo, so react and react-dom resolve from its node_modules.
  fs.mkdirSync(path.join(import.meta.dirname, '..', '.claude'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(import.meta.dirname, '..', '.claude', 'preview-test-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: { react: '19', 'react-dom': '19', vite: '8' } }));
  fs.writeFileSync(path.join(dir, 'src/Badge.tsx'), 'export function Badge({ text }: { text: string }) { return <span>{text}</span>; }\n');
  const server = await createServer({ root: dir, configFile: false, logLevel: 'silent', plugins: [react(), frontdex({ overlay: true })], server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  try {
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    assert.equal((await (await fetch(`${base}/__frontdex/api/info`)).json()).livePreview, 'preview');
    const html = await (await fetch(`${base}/__frontdex/preview?id=Badge`)).text();
    assert.match(html, /@react-refresh/, 'Vite HTML pipeline ran (React preamble)');
    assert.match(html, /virtual:frontdex-preview/);
    assert.doesNotMatch(html, /overlay\.js/, 'no overlay on frontdex pages');
    const entry = await (await fetch(`${base}/@id/virtual:frontdex-preview`)).text();
    assert.match(entry, /frontdex:props/);
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
