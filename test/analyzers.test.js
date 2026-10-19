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
  assert.deepEqual(shop.tokens.definitions['--danger'], { value: '#dc2626', at: 'app/globals.css:1', source: 'css', uses: 3 });
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

test('CSS-in-JS: styled components, theme objects, Tailwind classes resolved to theme tokens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cssinjs-'));
  const write = (rel, code) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), code);
  };
  write('package.json', JSON.stringify({ name: 'sc', dependencies: { react: '19', 'styled-components': '6', tailwindcss: '3' } }));
  write('tailwind.config.js', "module.exports = { theme: { extend: { colors: { brand: { 500: '#3b82f6' } } } } };\n");
  write('src/theme.ts', "export const theme = { colors: { primary: '#6d28d9', text: '#111827' }, space: { sm: '8px' } };\n");
  write('src/Button.tsx', [
    "import styled from 'styled-components';",
    'export const Button = styled.button`',
    '  color: #6d28d9;',
    '  padding: 8px;',
    '`;',
    'export const Primary = styled(Button)({ backgroundColor: "#6d28da" });',
    'export function Toolbar() { return <div className="md:bg-brand-500 p-2"><Primary>Go</Primary></div>; }',
  ].join('\n'));
  const cat = scanProject(loadConfig(dir)).catalogue;
  const C = cat.components;
  assert.equal(C.Button.kind, 'styled');
  assert.equal(C.Button.element, 'button');
  assert.deepEqual(C.Primary.renders, ['Button']);
  assert.deepEqual(C.Toolbar.renders, ['Primary']);
  assert.equal(cat.tokens.definitions['theme.colors.primary'].at, 'src/theme.ts:1');
  assert.deepEqual(cat.tokens.drift.filter((d) => d.at.startsWith('src/Button.tsx')).map((d) => `${d.value} ${d.match} ${d.use}`), ['#6d28d9 exact theme.colors.primary', '8px exact theme.space.sm', '#6d28da near theme.colors.primary']);
  assert.equal(C.Toolbar.styles.classes.find((c) => c.name === 'md:bg-brand-500').token, 'colors.brand.500');
  assert.deepEqual(cat.tokens.definitions['colors.brand.500'].usedBy, ['Toolbar']);
});
