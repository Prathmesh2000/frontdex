import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scanProject } from '../src/index.js';
import { baseName } from '../src/scanner/analyzers/duplicates.js';
import { normalizeColor } from '../src/scanner/analyzers/tokens.js';

const shop = scanProject(loadConfig(path.resolve(import.meta.dirname, '../examples/next-app'))).catalogue;

test('duplicate components: same name in two folders, Legacy/Old prefixes, issue on the less-used one', () => {
  assert.equal(baseName('LegacyButton'), 'Button');
  assert.equal(baseName('OldPromoBannerV2'), 'PromoBanner');
  assert.equal(baseName('ButtonContainer'), 'Button');
  assert.equal(baseName('Container'), 'Container');
  const pairs = shop.duplicates.map((d) => d.components.join(' ~ '));
  assert.ok(pairs.includes('Card@src/components/ui/Card.tsx ~ Card@src/features/admin/Card.tsx'));
  assert.ok(pairs.includes('Button ~ LegacyButton'));
  // Button is used everywhere, LegacyButton by one page: the issue lands on LegacyButton.
  assert.ok(shop.components.LegacyButton.issues.some((i) => i.type === 'possible-duplicate' && /looks like Button/.test(i.message)));
  assert.ok(!(shop.components.Button.issues ?? []).some((i) => i.type === 'possible-duplicate'));
  // Page roots are not compared with each other.
  assert.ok(!shop.duplicates.some((d) => d.components.some((id) => id.endsWith('Page'))));
});

test('design tokens: CSS custom properties, exact and near drift with evidence on both sides', () => {
  assert.equal(normalizeColor('#ABC'), '#aabbcc');
  assert.equal(normalizeColor('rgb(220, 38, 38)'), '#dc2626');
  assert.equal(normalizeColor('rgba(0 0 0 / 0.5)'), '#000000');
  assert.equal(normalizeColor('red'), null);
  assert.deepEqual(shop.tokens.definitions['--danger'], { value: '#dc2626', at: 'app/globals.css:1', source: 'css' });
  const near = shop.tokens.drift.find((d) => d.match === 'near');
  assert.deepEqual(near, { value: '#dc2727', at: 'src/features/products/ProductCard.module.css:7', property: 'color', token: '--danger', defined: 'app/globals.css:1', match: 'near', use: 'var(--danger)' });
  assert.ok(shop.tokens.drift.some((d) => d.value === '12px' && d.token === '--radius-card'));
});

test('Tailwind theme tokens and arbitrary values on components', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokens-'));
  const write = (rel, code) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), code);
  };
  write('package.json', JSON.stringify({ name: 'tw', dependencies: { react: '19', tailwindcss: '3' } }));
  write('tailwind.config.js', "module.exports = { theme: { extend: { colors: { brand: { 500: '#3b82f6', DEFAULT: '#2563eb' } }, spacing: { 18: '4.5rem' } } } };\n");
  write('src/Hero.tsx', 'export function Hero() { return <h1 className="text-[#3b82f6] mt-[72px] p-4">Hi</h1>; }\n');
  const cat = scanProject(loadConfig(dir)).catalogue;
  assert.deepEqual(Object.keys(cat.tokens.definitions).sort(), ['colors.brand', 'colors.brand.500', 'spacing.18']);
  assert.deepEqual(cat.tokens.drift.map((d) => `${d.value} → ${d.use}`), ['text-[#3b82f6] → brand-500', 'mt-[72px] → 18']);
  assert.deepEqual(cat.components.Hero.issues.map((i) => i.type), ['token-drift', 'token-drift']);
});
