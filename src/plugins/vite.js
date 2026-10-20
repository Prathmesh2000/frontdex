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
 */
export default function catalogue({ root } = {}) {
  let app;
  return {
    name: 'frontdex',
    apply: 'serve',
    configureServer(server) {
      const config = loadConfig(path.resolve(root ?? server.config.root));
      const log = (msg) => server.config.logger.info(`[frontdex] ${msg}`, { timestamp: true });
      // createApp starts the watcher, whose first scan also warms the session the per-save fast path needs.
      app = createApp(config, { watch: true, log });
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
  };
}
