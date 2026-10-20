/*
 * Heavy imports in client code: packages (or import styles) known to add a lot to the browser bundle, with the usual
 * lighter alternative. Sizes are approximate min+gzip figures for the whole package, which is what these import styles
 * pull in. Server Components (Next App Router) are skipped: their imports never reach the browser.
 *
 * ponytail: a fixed list, not a bundler measurement; real per-page sizes need the build output (e.g. next build stats).
 */

const HEAVY = [
  { match: (s) => s === 'moment' || s.startsWith('moment/'), label: 'moment', kb: 72, alt: 'dayjs or date-fns' },
  { match: (s) => s === 'lodash', label: 'lodash (CommonJS build, not tree-shaken)', kb: 25, alt: "lodash-es, or per-method imports like 'lodash/debounce'" },
  { match: (s) => s === 'chart.js/auto', label: 'chart.js/auto (every chart type)', kb: 70, alt: 'register only the chart types used from chart.js' },
  { match: (s) => s === 'three', label: 'three', kb: 155, alt: 'import from three/src/... or lazy-load the 3D view' },
  { match: (s) => s === 'xlsx' || s === 'exceljs', label: 'spreadsheet library', kb: 300, alt: 'load it with a dynamic import() when the export runs' },
  { match: (s) => s === 'pdfjs-dist' || s === 'jspdf', label: 'PDF library', kb: 250, alt: 'load it with a dynamic import() when needed' },
  { match: (s) => s === 'aws-sdk', label: 'aws-sdk v2', kb: 400, alt: '@aws-sdk/client-* (v3, modular)' },
  { match: (s) => s.startsWith('firebase/compat'), label: 'firebase compat SDK', kb: 120, alt: 'the modular firebase/* API' },
  { match: (s) => s === 'jquery', label: 'jquery', kb: 30, alt: 'DOM APIs or the framework' },
  { match: (s) => s === 'core-js' || s === '@babel/polyfill', label: 'full polyfill bundle', kb: 60, alt: 'targeted polyfills via browserslist' },
  { match: (s, imp) => (s === 'rxjs' || s === 'ramda' || s === 'date-fns') && imp === '*', label: 'namespace import of a large library', kb: 30, alt: 'named imports so the bundler can tree-shake' },
];

/**
 * Adds a `heavy-import` issue to the first component of each module that imports something on the list, unless the
 * component renders on the server. Lazy imports (React.lazy / next/dynamic) are not counted.
 */
export function heavyImports(entries, components) {
  const byModule = new Map();
  for (const { mod, c } of entries) if (!byModule.has(mod) || (c.line ?? 0) < (byModule.get(mod).line ?? 0)) byModule.set(mod, c);
  for (const [mod, first] of byModule) {
    const comp = components[first.id];
    if (!comp || comp.rendering === 'server') continue;
    const seen = new Set();
    for (const imp of mod.imports.values()) {
      if (imp.lazy) continue;
      const rule = HEAVY.find((h) => h.match(imp.source, imp.imported === '*' ? '*' : imp.imported));
      if (!rule || seen.has(rule.label)) continue;
      seen.add(rule.label);
      (comp.issues ??= []).push({ type: 'heavy-import', severity: 'medium', message: `imports ${rule.label} (~${rule.kb} KB min+gzip) into client code`, fix: `use ${rule.alt}` });
    }
  }
}
