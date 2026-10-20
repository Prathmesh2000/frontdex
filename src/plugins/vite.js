import path from 'node:path';
import { loadConfig } from '../config.js';
import { createApp } from '../server.js';

const MOUNT = '/__frontdex';

/**
 * Vite plugin: keeps the catalogue updated while the dev server runs, and serves the frontdex UI and API on it at
 * /__frontdex/ (same origin as the app, no second port). `apply: 'serve'` keeps it out of `vite build` entirely.
 *   // vite.config.js
 *   import frontdex from 'frontdex/vite';
 *   export default { plugins: [react(), frontdex()] };
 * Options: `overlay: true` injects the Alt+hover component overlay into the page; `allowLan: true` lets other machines
 * reach the API when the dev server is bound to the network (it serves source code, so it is off by default).
 */
export default function catalogue({ root, overlay = false, allowLan = false } = {}) {
  let app;
  return {
    name: 'frontdex',
    apply: 'serve',
    configureServer(server) {
      const config = loadConfig(path.resolve(root ?? server.config.root));
      const log = (msg) => server.config.logger.info(`[frontdex] ${msg}`, { timestamp: true });
      // createApp starts the watcher, whose first scan also warms the session the per-save fast path needs.
      // The API stays loopback-only even under `vite --host` unless allowLan says otherwise: it serves source code.
      app = createApp(config, { watch: true, log, allowLan });
      server.middlewares.use(MOUNT, (req, res) => {
        // The UI loads assets relative to its folder, so the bare mount point needs its trailing slash.
        if (req.originalUrl === MOUNT) return res.writeHead(301, { location: `${MOUNT}/` }).end();
        app.handler(req, res);
      });
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address === 'object') log(`catalogue UI at http://localhost:${address.port}${MOUNT}/`);
      });
      server.httpServer?.once('close', () => app?.close());
    },
    // The overlay is a plain script served by frontdex itself, so it never passes through the app's module graph.
    transformIndexHtml: () => (overlay ? [{ tag: 'script', attrs: { type: 'module', src: `${MOUNT}/overlay.js` }, injectTo: 'body' }] : []),
  };
}
