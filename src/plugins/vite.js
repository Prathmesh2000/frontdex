import path from 'node:path';
import { loadConfig } from '../config.js';
import { createApp } from '../server.js';

const MOUNT = '/__frontdex';
const PREVIEW_ID = 'virtual:frontdex-preview';
const PREVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>frontdex preview</title></head>
<body><div id="frontdex-preview"></div><script type="module" src="/@id/${PREVIEW_ID}"></script></body></html>`;

/**
 * The preview page's entry: renders one component, found by catalogue id, through the dev server's own module graph
 * (so its imports, CSS and HMR work as in the app). Props come by postMessage from the catalogue UI's props editor;
 * `previewWrapper` in frontdex.config.json may name a file whose default export wraps every preview in
 * the app's providers (router, theme, store).
 */
const previewModule = (wrapperFile) => `
import { Component, createElement as h, Fragment, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
${wrapperFile ? `import Wrapper from ${JSON.stringify(`/@fs/${wrapperFile}`)};` : 'const Wrapper = ({ children }) => h(Fragment, null, children);'}

const params = new URLSearchParams(location.search);
const box = { padding: 16, font: '13px system-ui', color: '#b91c1c', whiteSpace: 'pre-wrap' };

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return h('div', { style: box }, String(this.state.error?.message ?? this.state.error),
      '\\n\\nIf the component needs providers (router, theme, store, data), set "previewWrapper" in frontdex.config.json to a file whose default export renders them around {children}.');
  }
}

// Props arrive only from the catalogue UI embedding this page (same origin, our parent window), never from the URL:
// a crafted link could otherwise pass dangerouslySetInnerHTML and run script on the dev server's origin.
function Preview({ Comp }) {
  const [props, setProps] = useState({});
  useEffect(() => {
    const onMessage = (e) => e.source === parent && e.origin === location.origin && e.data?.type === 'frontdex:props' && setProps(e.data.props ?? {});
    addEventListener('message', onMessage);
    // Ask for the props once listening, so none sent while the component was still loading are lost.
    if (parent !== window) parent.postMessage({ type: 'frontdex:ready' }, location.origin);
    return () => removeEventListener('message', onMessage);
  }, []);
  // A new key per props change resets a boundary that caught the previous props' error.
  return h(Boundary, { key: JSON.stringify(props) }, h(Wrapper, null, h(Comp, props)));
}

async function main() {
  const root = createRoot(document.getElementById('frontdex-preview'));
  const fail = (message) => root.render(h('div', { style: box }, message));
  try {
    const id = params.get('id');
    const [info, c] = await Promise.all(['info', \`component?id=\${encodeURIComponent(id)}\`].map((p) => fetch(\`${MOUNT}/api/\${p}\`).then((r) => r.json())));
    if (c.error) return fail(c.error);
    const mod = await import(/* @vite-ignore */ \`/@fs/\${info.root.replaceAll('\\\\', '/')}/\${c.file}\`);
    const Comp = c.export === 'default' ? mod.default : mod[c.name];
    if (!Comp) return fail(\`\${c.file} does not export \${c.name}\`);
    root.render(h(Preview, { Comp }));
  } catch (err) {
    fail(String(err?.message ?? err));
  }
}
main();
`;

/**
 * Vite plugin: keeps the catalogue updated while the dev server runs, and serves the frontdex UI and API on it at
 * /__frontdex/ (same origin as the app, no second port). `apply: 'serve'` keeps it out of `vite build` entirely.
 *   // vite.config.js
 *   import frontdex from 'frontdex/vite';
 *   export default { plugins: [react(), frontdex()] };
 * Options: `overlay: true` injects the Alt+hover component overlay into the page; `allowLan: true` lets other machines
 * reach the API when the dev server is bound to the network (it serves source code, so it is off by default).
 * React components also get a live preview at /__frontdex/preview?id=<component id>, shown in the UI with a props editor.
 */
export default function catalogue({ root, overlay = false, allowLan = false } = {}) {
  let app;
  let config;
  return {
    name: 'frontdex',
    apply: 'serve',
    resolveId: (id) => (id === PREVIEW_ID ? `\0${PREVIEW_ID}` : null),
    load: (id) => (id === `\0${PREVIEW_ID}` ? previewModule(config?.previewWrapper && path.resolve(config.root, config.previewWrapper).split(path.sep).join('/')) : null),
    configureServer(server) {
      config = loadConfig(path.resolve(root ?? server.config.root));
      const log = (msg) => server.config.logger.info(`[frontdex] ${msg}`, { timestamp: true });
      // createApp starts the watcher, whose first scan also warms the session the per-save fast path needs.
      // The API stays loopback-only even under `vite --host` unless allowLan says otherwise: it serves source code.
      app = createApp(config, { watch: true, log, allowLan, livePreview: 'preview' });
      server.middlewares.use(MOUNT, async (req, res, next) => {
        // The UI loads assets relative to its folder, so the bare mount point needs its trailing slash.
        if (req.originalUrl === MOUNT) return res.writeHead(301, { location: `${MOUNT}/` }).end();
        if (req.url.startsWith('/preview')) {
          try {
            // Through Vite's HTML pipeline, so the React plugin's Fast Refresh preamble is in place.
            const html = await server.transformIndexHtml(req.originalUrl, PREVIEW_HTML);
            return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
          } catch (err) {
            return next(err);
          }
        }
        app.handler(req, res);
      });
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address === 'object') log(`catalogue UI at http://localhost:${address.port}${MOUNT}/`);
      });
      server.httpServer?.once('close', () => app?.close());
    },
    // The overlay is a plain script served by frontdex itself, so it never passes through the app's module graph.
    // Not on frontdex's own pages: the preview HTML is transformed by the plugin itself, which only sets ctx.path.
    transformIndexHtml: (html, ctx) => (overlay && !(ctx.originalUrl ?? ctx.path ?? '').startsWith(MOUNT) ? [{ tag: 'script', attrs: { type: 'module', src: `${MOUNT}/overlay.js` }, injectTo: 'body' }] : []),
  };
}
