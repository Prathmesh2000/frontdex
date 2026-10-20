import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildReport, catalogueAtRef, COMMENT_MARKER, formatMarkdown } from '../src/ci.js';
import { loadConfig, scan } from '../src/index.js';

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/next-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$/.test(src) });
  return dir;
}

const edit = (dir, rel, from, to) => {
  const file = path.join(dir, rel);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(from), `${rel} contains ${from}`);
  fs.writeFileSync(file, text.replace(from, to));
};

test('PR report: changed props with their blast radius, new issues, Markdown safe for GitHub', () => {
  const dir = project();
  const config = loadConfig(dir);
  const base = scan(config, { dryRun: true }).catalogue;
  edit(dir, 'src/features/products/ProductCard.tsx', 'interface ProductCardProps {', 'interface ProductCardProps {\n  badge?: string;');
  edit(dir, 'src/features/products/ProductCard.tsx', 'function ProductCard({ product,', 'function ProductCard({ badge, product,');
  edit(dir, 'src/features/products/ProductCard.tsx', '  return (', '  if (badge) return <img src={badge} />;\n  return (');
  const head = scan(config, { dryRun: true }).catalogue;

  const report = buildReport(base, head, { baseLabel: 'main', headLabel: 'feature' });
  const card = report.components.find((c) => c.id === 'ProductCard');
  assert.equal(card.change, 'changed');
  assert.ok(card.details.some((d) => d.startsWith('props +badge')));
  assert.ok(card.pages.includes('/products') && card.dependents.length > 0);
  assert.ok(report.affectedPages.includes('/products'));
  assert.deepEqual(report.newIssues.filter((i) => i.component === 'ProductCard').map((i) => i.type), ['a11y-img-alt']);

  const md = formatMarkdown(report);
  assert.ok(md.startsWith(COMMENT_MARKER));
  assert.match(md, /&lt;img&gt; has no alt text/);
  assert.doesNotMatch(md, /<img>/);
});

test('git refs: committed YAML at a ref is read directly; without it the ref is scanned in a temporary worktree', () => {
  const dir = project();
  const g = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'pipe' }).toString().trim();
  g('init', '-q');
  g('add', '-A');
  g('commit', '-qm', 'without catalogue');
  const config = loadConfig(dir);
  const scanned = catalogueAtRef(config, 'HEAD');
  assert.equal(scanned.source, 'scan of HEAD');
  assert.ok(scanned.catalogue.components.ProductCard);
  assert.equal(g('worktree', 'list').split('\n').length, 1, 'temporary worktree removed');

  scan(config);
  g('add', '-A');
  g('commit', '-qm', 'with catalogue');
  const committed = catalogueAtRef(config, 'HEAD');
  assert.equal(committed.source, 'frontdex.yaml at HEAD');
  assert.deepEqual(Object.keys(committed.catalogue.components).sort(), Object.keys(scanned.catalogue.components).sort());
});

test('git refs that look like options are rejected before reaching git', () => {
  const dir = project();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const config = loadConfig(dir);
  assert.throws(() => catalogueAtRef(config, '--output=/tmp/x'), /Invalid git ref/);
  assert.throws(() => catalogueAtRef(config, 'no-such-ref-xyz'));
});
