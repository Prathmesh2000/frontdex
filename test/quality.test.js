import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scanProject } from '../src/index.js';
import { a11yIssues } from '../src/scanner/analyzers/a11y.js';

const shop = scanProject(loadConfig(path.resolve(import.meta.dirname, '../examples/next-app'))).catalogue;
const C = shop.components;
const types = (id, prefix) => (C[id].issues ?? []).filter((i) => i.type.startsWith(prefix)).map((i) => i.type);

function scanFixture(deps, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: deps }));
  for (const [rel, code] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), code);
  }
  return scanProject(loadConfig(dir)).catalogue;
}

test('a11y rules on plain elements', () => {
  const check = (tag, attrs, text = true, inLabel = false) => a11yIssues({ tag, attrs: new Map(Object.entries(attrs)), text, line: 1, inLabel }).map((i) => i.type);
  assert.deepEqual(check('img', {}), ['a11y-img-alt']);
  assert.deepEqual(check('img', { alt: '' }), []);
  assert.deepEqual(check('img', { 'aria-hidden': 'true' }), []);
  assert.deepEqual(check('button', {}, false), ['a11y-control-name']);
  assert.deepEqual(check('button', { 'aria-label': 'Close' }, false), []);
  assert.deepEqual(check('button', {}, null), [], 'unknown children (a component) are not guessed at');
  assert.deepEqual(check('input', { placeholder: 'Email' }), ['a11y-field-label'], 'a placeholder is not a label');
  assert.deepEqual(check('input', {}, true, true), [], 'nested in <label>');
  assert.deepEqual(check('input', { type: 'hidden' }), []);
  assert.deepEqual(check('div', { onClick: true }), ['a11y-click-handler']);
  assert.deepEqual(check('div', { onClick: true, role: 'button', onKeyDown: true }), []);
  assert.deepEqual(check('li', { '@click': true }), ['a11y-click-handler'], 'Vue listener syntax');
  assert.deepEqual(check('a', { href: '/', tabIndex: '2' }), ['a11y-tabindex']);
  assert.deepEqual(check('html', {}), ['a11y-html-lang']);
});

test('a11y on the examples: real findings, and labelled or literal-valued cases stay quiet', () => {
  assert.deepEqual(types('Filters', 'a11y'), ['a11y-field-label']); // the category <select>; the checkbox sits in a <label>
  assert.deepEqual(types('NewsletterForm', 'a11y'), ['a11y-field-label']); // placeholder only
  assert.deepEqual(types('Modal', 'a11y'), ['a11y-click-handler']); // backdrop click; tabIndex={-1} is fine
  assert.deepEqual(types('ProfileForm', 'a11y'), []);
});

test('ownership and tests: CODEOWNERS (last match wins), test and story files next to components', () => {
  assert.deepEqual(C.Button.codeowners, ['@northwind/design-system']);
  assert.deepEqual(C.AdminSidebar.codeowners, ['@northwind/back-office', '@ana']);
  assert.deepEqual(C.HomePage.codeowners, ['@northwind/web']);
  assert.deepEqual(C.Button.tests, ['Button.test.tsx']);
  assert.deepEqual(C.Button.stories, ['Button.stories.tsx']);
  assert.equal(C.Card?.tests, undefined);
});

test('i18n: hard-coded text is reported only when the project uses an i18n library', () => {
  const files = { 'src/Banner.tsx': 'export function Banner() { return <div><h1>Welcome back</h1><input placeholder="Search products" aria-label="Search" /><code>npm i</code></div>; }\n' };
  const plain = scanFixture({ react: '19' }, files);
  assert.equal((plain.components.Banner.issues ?? []).filter((i) => i.type === 'i18n-hardcoded-text').length, 0);
  const intl = scanFixture({ react: '19', 'react-i18next': '15' }, files);
  const [issue] = intl.components.Banner.issues.filter((i) => i.type === 'i18n-hardcoded-text');
  assert.match(issue.message, /^3 piece\(s\) of hard-coded text, e\.g\. "Welcome back"/);
});
