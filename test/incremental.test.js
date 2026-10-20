import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scan } from '../src/index.js';

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'incr-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/next-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$/.test(src) });
  return dir;
}
const strip = (cat) => JSON.stringify({ ...cat, info: { ...cat.info, generatedAt: undefined } });

test('watch fast path: patched records are current, and the settling full scan equals a cold scan', () => {
  const dir = tempProject();
  const config = { ...loadConfig(dir), history: { enabled: false, limit: 0 }, agents: { enabled: false } };
  const session = {};
  scan(config, { session });
  const at = (rel) => path.join(dir, rel);
  const edit = (rel, fn) => fs.writeFileSync(at(rel), fn(fs.readFileSync(at(rel), 'utf8')));
  // The settling full scan, as the watcher runs it, then the same project scanned from nothing.
  const settle = (rel) => {
    scan(config, { session, changed: [at(rel)] });
    assert.equal(strip(session.catalogue), strip(scan({ ...config }, { dryRun: true, full: true }).catalogue), `after ${rel}`);
  };

  // 1. Body edit that adds a child: renders and the child's usedBy update at once.
  const drawer = 'src/features/cart/CartDrawer.tsx';
  edit(drawer, (s) => s.replace("import { Button, Modal } from '@/components/ui';", "import { Badge, Button, Modal } from '@/components/ui';").replace('<OrderSummary', '<Badge>new</Badge>\n      <OrderSummary'));
  let r = scan(config, { session, changed: [at(drawer)], fast: true });
  assert.equal(r.fast, true);
  assert.equal(r.changed, true);
  assert.ok(r.catalogue.components.CartDrawer.renders.includes('Badge'));
  assert.ok(r.catalogue.components.Badge.usedBy.includes('CartDrawer'));
  assert.ok(r.catalogue.components.CartDrawer.pages?.length, 'project-wide fields are carried over');
  settle(drawer);

  // 2. Removing it again takes CartDrawer out of Badge's usedBy.
  edit(drawer, (s) => s.replace('<Badge>new</Badge>\n      ', ''));
  r = scan(config, { session, changed: [at(drawer)], fast: true });
  assert.equal(r.fast, true);
  assert.ok(!r.catalogue.components.CartDrawer.renders.includes('Badge'));
  assert.ok(!(r.catalogue.components.Badge.usedBy ?? []).includes('CartDrawer'));
  settle(drawer);

  // 3. An interface change (a new export) re-links the files that import the module.
  const ui = 'src/components/ui/index.ts';
  edit(ui, (s) => `${s}\nexport const UI_VERSION = '2';\n`);
  r = scan(config, { session, changed: [at(ui)], fast: true });
  assert.equal(r.fast, true);
  assert.ok(r.delta.relinked > 0, 'importers re-linked');
  settle(ui);

  // 4. Renaming a component changes ids: only a full scan is exact, so the fast path declines.
  edit(drawer, (s) => s.replace('export function CartDrawer()', 'export function CartPanel()'));
  r = scan(config, { session, changed: [at(drawer)], fast: true });
  assert.ok(!r.fast);
  assert.ok(r.catalogue.components.CartPanel);
  assert.equal(strip(session.catalogue), strip(scan({ ...config }, { dryRun: true, full: true }).catalogue));
});

test('a fast patch defers writes: the settling scan writes and reports the change', () => {
  const dir = tempProject();
  const config = { ...loadConfig(dir), history: { enabled: true, limit: 50 }, agents: { enabled: false } };
  const session = {};
  scan(config, { session });
  const file = path.join(dir, 'src/features/cart/CartDrawer.tsx');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('<OrderSummary lines={items} coupon={coupon} readOnly />', '<OrderSummary lines={items} coupon={coupon} />'));
  const fast = scan(config, { session, changed: [file], fast: true });
  assert.equal(fast.fast, true);
  assert.equal(fast.commit, null);
  // The patched catalogue may equal the full result, yet the edit is still unwritten: the full scan must say changed.
  const full = scan(config, { session, changed: [file] });
  assert.equal(full.changed, true);
  assert.ok(full.commit, 'history recorded once edits settle');
});

test('fast path: folder events and editor temp files are ignored, new or deleted source files need a full scan', () => {
  const dir = tempProject();
  const config = { ...loadConfig(dir), history: { enabled: false, limit: 0 }, agents: { enabled: false } };
  const session = {};
  scan(config, { session });
  const folder = path.join(dir, 'src/features/cart');
  const file = path.join(folder, 'CartDrawer.tsx');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('readOnly />', '/>'));
  // What a save through a temp file reports: the temp file (gone by now), the folder, then the file itself.
  let r = scan(config, { session, changed: [path.join(folder, 'sedA1b2C3'), folder, file], fast: true });
  assert.equal(r.fast, true);
  assert.equal(r.delta.relinked, 1);

  fs.writeFileSync(path.join(folder, 'CartNote.tsx'), 'export function CartNote() { return <p>note</p>; }\n');
  r = scan(config, { session, changed: [folder, path.join(folder, 'CartNote.tsx')], fast: true });
  assert.ok(!r.fast, 'a new component file needs a full scan');
  assert.ok(r.catalogue.components.CartNote);

  fs.rmSync(path.join(folder, 'CartNote.tsx'));
  r = scan(config, { session, changed: [path.join(folder, 'CartNote.tsx')], fast: true });
  assert.ok(!r.fast, 'a deleted file needs a full scan');
  assert.equal(r.catalogue.components.CartNote, undefined);
});
