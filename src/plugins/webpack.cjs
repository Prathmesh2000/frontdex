const { spawnWatcher } = require('./watcher.cjs');

/**
 * webpack and Rspack plugin (Rspack runs webpack plugins): keeps the catalogue updated while the compiler watches
 * (webpack-dev-server, `rspack dev`, `--watch`). Production builds never watch, so they are untouched: no loader, no
 * injected code.
 *   // webpack.config.js / rspack.config.js
 *   const FrontdexPlugin = require('frontdex/webpack');   // or 'frontdex/rspack'
 *   module.exports = { plugins: [new FrontdexPlugin()] };
 */
class FrontdexPlugin {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
  }

  apply(compiler) {
    if (!this.enabled) return;
    let child;
    // watchRun fires only in watch mode, once per rebuild; the watcher starts on the first.
    compiler.hooks.watchRun.tap('FrontdexPlugin', () => {
      child ??= spawnWatcher();
    });
    compiler.hooks.watchClose.tap('FrontdexPlugin', () => {
      if (!child) return;
      child.kill();
      child = undefined;
      // Let a later watch session in the same process start a watcher again.
      delete process.env.RCAT_WATCHER;
    });
  }
}

module.exports = FrontdexPlugin;
module.exports.FrontdexPlugin = FrontdexPlugin;
module.exports.default = FrontdexPlugin;
