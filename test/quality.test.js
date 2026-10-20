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

test('a11y in Svelte, Astro and Angular templates', () => {
  const svelte = scanFixture({ svelte: '5' }, { 'src/Bad.svelte': '<img src="a.png">\n<div on:click={() => {}}>x</div>\n<label>Name <input></label>\n<button onclick={() => {}}></button>\n' });
  assert.deepEqual(svelte.components.Bad.issues.map((i) => i.type), ['a11y-img-alt', 'a11y-click-handler', 'a11y-control-name']);
  const astro = scanFixture({ astro: '5' }, { 'src/pages/index.astro': '<html><body><img src="/x.png"><input name="q"><a href="/">{title}</a></body></html>\n' });
  assert.deepEqual(Object.values(astro.components)[0].issues.map((i) => i.type), ['a11y-html-lang', 'a11y-img-alt', 'a11y-field-label']);
  const ng = scanFixture({ '@angular/core': '19' }, {
    'src/app/a.component.ts': "import { Component } from '@angular/core';\n@Component({ selector: 'app-a', templateUrl: './a.component.html' })\nexport class AComponent {}\n",
    'src/app/a.component.html': '<button (click)="go()"></button>\n<button (click)="go()">{{ label }}</button>\n',
  });
  const [issue] = ng.components.AComponent.issues;
  assert.equal(issue.type, 'a11y-control-name');
  assert.match(issue.message, /\(\.\/a\.component\.html:1\)$/);
  assert.equal(ng.components.AComponent.issues.length, 1);
});

test('stories as usage examples, and heavy imports in client code', () => {
  assert.deepEqual(C.Button.examples, [{ story: 'Button.stories.tsx#Primary', args: { variant: '"primary"', children: '"Save"' } }]);
  const cat = scanFixture({ next: '15', react: '19' }, {
    'app/page.tsx': "import moment from 'moment';\nimport { Chart } from './Chart';\nexport default function Page() { return <main>{moment().format()}<Chart /></main>; }\n",
    'app/Chart.tsx': "'use client';\nimport _ from 'lodash';\nimport 'chart.js/auto';\nexport function Chart() { return <canvas>{_.noop()}</canvas>; }\n",
    'app/Legend.stories.tsx': 'export default { args: { compact: true } };\nexport const Wide = { args: { columns: 4 } };\nexport const Plain = {};\n',
    'app/Legend.tsx': 'export function Legend() { return <ul />; }\n',
  });
  assert.deepEqual((cat.components.Page.issues ?? []).filter((i) => i.type === 'heavy-import'), [], 'server components are not shipped to the browser');
  assert.deepEqual(cat.components.Chart.issues.filter((i) => i.type === 'heavy-import').map((i) => i.message), ['imports lodash (CommonJS build, not tree-shaken) (~25 KB min+gzip) into client code']);
  assert.deepEqual(cat.components.Legend.examples, [{ story: 'Legend.stories.tsx#Wide', args: { compact: 'true', columns: '4' } }, { story: 'Legend.stories.tsx#Plain', args: { compact: 'true' } }]);
});

test('fix: removes unused imports in every import shape, replaces exact token values only with --tokens', async () => {
  const { removeImport, planFixes, applyFixes } = await import('../src/fix.js');
  const f = 'x.tsx';
  assert.equal(removeImport("import A from 'a';\nuse();\n", f, 'A'), 'use();\n');
  assert.equal(removeImport("import { a, b, c } from 'm';\n", f, 'b'), "import { a, c } from 'm';\n");
  assert.equal(removeImport("import { a, b } from 'm';\n", f, 'b'), "import { a } from 'm';\n");
  assert.equal(removeImport("import Def, { a } from 'm';\n", f, 'a'), "import Def from 'm';\n");
  assert.equal(removeImport("import Def, { a } from 'm';\n", f, 'Def'), "import { a } from 'm';\n");
  assert.equal(removeImport("import 'side-effect';\n", f, 'x'), "import 'side-effect';\n");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/next-app'), dir, { recursive: true, filter: (src) => !/[\/]\.frontdex([\/]|$)|frontdex\.yaml$/.test(src) });
  const config = loadConfig(dir);
  const plan = planFixes(config, scanProject(config).catalogue);
  assert.deepEqual(plan.map((p) => p.kind), ['unused-import'], 'token fixes need --tokens');
  applyFixes(planFixes(config, scanProject(config).catalogue, { tokens: true }));
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'src/features/account/AccountNav.tsx'), 'utf8'), /import \{ Badge \}/);
  assert.match(fs.readFileSync(path.join(dir, 'src/features/products/ProductCard.module.css'), 'utf8'), /border-radius: var\(--radius-card\)/);
  assert.match(fs.readFileSync(path.join(dir, 'src/features/products/ProductCard.module.css'), 'utf8'), /#dc2727/, 'near matches are left for a human');
  const after = scanProject(config).catalogue;
  assert.equal(after.health.unusedImports, undefined);
  assert.ok(!after.tokens.drift.some((d) => d.match === 'exact' && d.at.endsWith('.css:1')));
});
