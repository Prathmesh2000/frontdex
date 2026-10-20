const { spawn } = require('node:child_process');
const path = require('node:path');

const BIN = path.join(__dirname, '..', '..', 'bin', 'frontdex.js');

/**
 * Starts `frontdex watch` next to a dev server, stopped with it through --parent-pid. A child process rather than an
 * import keeps the plugins CommonJS-friendly (webpack and Next configs are often require()d) and off the bundler's thread.
 * Returns null when a watcher already runs for this process tree: bundlers evaluate configs in several processes and
 * multi-compiler setups apply plugins more than once, and the env flag is inherited by all of them.
 */
function spawnWatcher() {
  if (process.env.RCAT_WATCHER) return null;
  process.env.RCAT_WATCHER = '1';
  const child = spawn(process.execPath, [BIN, 'watch', '--parent-pid', String(process.pid)], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
  child.on('error', (err) => console.warn(`[frontdex] watcher failed to start: ${err.message}`));
  return child;
}

module.exports = { spawnWatcher };
