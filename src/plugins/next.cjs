const { spawnWatcher } = require('./watcher.cjs');

const DEV_PHASE = 'phase-development-server';

/**
 * Wraps a Next.js config so `next dev` also runs `frontdex watch` alongside it.
 *   // next.config.js
 *   const { withFrontdex } = require('frontdex/next');
 *   module.exports = withFrontdex({ reactStrictMode: true });
 */
function withCatalogue(nextConfig = {}, { enabled = true } = {}) {
  return async (phase, ctx) => {
    if (enabled && phase === DEV_PHASE) spawnWatcher();
    return typeof nextConfig === 'function' ? nextConfig(phase, ctx) : nextConfig;
  };
}

// withCatalogue is the react-catalogue era name, kept so existing next.config.js files keep working.
module.exports = { withFrontdex: withCatalogue, withCatalogue };
