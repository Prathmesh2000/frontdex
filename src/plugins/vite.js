import path from 'node:path';
import { loadConfig } from '../config.js';
import { startWatcher } from '../watch.js';

/**
 * Vite plugin: keeps the catalogue updated while `vite` dev server runs.
 *   // vite.config.js
 *   import frontdex from 'frontdex/vite';
 *   export default { plugins: [react(), frontdex()] };
 */
export default function catalogue({ root } = {}) {
  let watcher;
  return {
    name: 'frontdex',
    apply: 'serve',
    configureServer(server) {
      const config = loadConfig(path.resolve(root ?? server.config.root));
      const log = (msg) => server.config.logger.info(`[frontdex] ${msg}`, { timestamp: true });
      watcher = startWatcher(config, { log });
      watcher.rescan();
      server.httpServer?.once('close', () => watcher?.close());
    },
  };
}
