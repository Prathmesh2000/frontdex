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
