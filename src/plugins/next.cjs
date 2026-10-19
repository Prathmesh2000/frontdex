const { spawn } = require('node:child_process');
const path = require('node:path');

const BIN = path.join(__dirname, '..', '..', 'bin', 'frontdex.js');
const DEV_PHASE = 'phase-development-server';

/**
 * Wraps a Next.js config so `next dev` also runs `frontdex watch` alongside it.
 *   // next.config.js
 *   const { withFrontdex } = require('frontdex/next');
 *   module.exports = withFrontdex({ reactStrictMode: true });
 */
function withCatalogue(nextConfig = {}, { enabled = true } = {}) {
  return async (phase, ctx) => {
    // Next evaluates the config in several processes; the env flag is inherited, so only the first one spawns a watcher.
    if (enabled && phase === DEV_PHASE && !process.env.RCAT_WATCHER) {
      process.env.RCAT_WATCHER = '1';
      const child = spawn(process.execPath, [BIN, 'watch', '--parent-pid', String(process.pid)], { cwd: process.cwd(), stdio: 'inherit', env: process.env });
      child.on('error', (err) => console.warn(`[frontdex] watcher failed to start: ${err.message}`));
    }
    return typeof nextConfig === 'function' ? nextConfig(phase, ctx) : nextConfig;
  };
}

// withCatalogue is the react-catalogue era name, kept so existing next.config.js files keep working.
module.exports = { withFrontdex: withCatalogue, withCatalogue };
