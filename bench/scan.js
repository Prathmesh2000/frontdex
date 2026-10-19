#!/usr/bin/env node
/*
 * Scan benchmark on a synthetic project: the Next example copied N times under packages/app-<i>/.
 * Measures cold scan, no-change rescan and one-file rescan (one-shot CLI, and watch mode with an in-memory session),
 * plus how much of the cold scan is spent in the parser.
 *
 *   node bench/scan.js            # 20 copies (~2k files)
 *   node bench/scan.js 250        # ~20k files, the 1.0 target size
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, scan } from '../src/index.js';
import { listProjectFiles } from '../src/scanner/files.js';

const copies = Number(process.argv[2] ?? 20);
const example = path.resolve(import.meta.dirname, '../examples/next-app');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcat-bench-'));
for (let i = 0; i < copies; i++) {
  fs.cpSync(example, path.join(root, 'packages', `app-${i}`), { recursive: true, filter: (p) => !p.includes('.catalogue') && !p.endsWith('catalogue.yaml') && !p.endsWith('catalogue.config.json') });
}
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'bench', dependencies: { next: '*' } }));

const config = { ...loadConfig(root), history: { enabled: false, limit: 0 } };
const files = listProjectFiles(config).sources;
const time = (fn) => {
  const t = performance.now();
  const r = fn();
  return [performance.now() - t, r];
};

const [cold] = time(() => scan(config, { full: true }));
const [noop] = time(() => scan(config));
const edited = files.find((f) => f.endsWith('ProductCard.tsx'));
fs.appendFileSync(edited, '\nexport const benchMarker = 1;\n');
const [one] = time(() => scan(config));

// Watch mode: what `rcat watch` / `serve -w` / the dev-server plugins do after a save.
const session = {};
scan(config, { session });
fs.appendFileSync(edited, '\nexport const benchMarker2 = 2;\n');
const [watchOne] = time(() => scan(config, { session, changed: [edited] }));

// Parser share: Babel parse alone over the same files, to show what a faster parser could save at most.
const { parse } = createRequire(import.meta.url)('@babel/parser');
const [parseOnly] = time(() => {
  for (const f of files) parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['decorators-legacy', 'typescript', 'jsx'], errorRecovery: true });
});

const rss = Math.round(process.memoryUsage().rss / 1e6);
console.log(`files            ${files.length}`);
console.log(`cold scan        ${(cold / 1000).toFixed(1)} s  (${(cold / files.length).toFixed(2)} ms/file)`);
console.log(`  parse only     ${(parseOnly / 1000).toFixed(1)} s  (${Math.round((100 * parseOnly) / cold)}% of cold scan)`);
console.log(`no-change scan   ${Math.round(noop)} ms`);
console.log(`one-file rescan  ${Math.round(one)} ms`);
console.log(`  watch mode     ${Math.round(watchOne)} ms`);
console.log(`peak-ish RSS     ${rss} MB`);
fs.rmSync(root, { recursive: true, force: true });
