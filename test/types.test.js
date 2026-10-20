import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import YAML from 'yaml';
import { generate } from '../scripts/schema-types.js';
import { validateCatalogue } from '../src/index.js';

const root = path.resolve(import.meta.dirname, '..');

test('spec/catalogue.d.ts is up to date with the JSON Schema', () => {
  assert.equal(fs.readFileSync(path.join(root, 'spec/catalogue.d.ts'), 'utf8'), generate(), 'stale types: run npm run gen:types');
});

test('src/index.d.ts declares exactly the public exports', async () => {
  const declared = [...fs.readFileSync(path.join(root, 'src/index.d.ts'), 'utf8').matchAll(/^export (?:declare )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  const actual = Object.keys(await import('../src/index.js'));
  assert.deepEqual([...new Set(declared)].sort(), actual.sort());
});

test('the declarations compile under strict TypeScript, as a consumer uses them', () => {
  const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
  const args = ['--noEmit', '--strict', '--skipLibCheck', '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', 'test/types-usage.ts', 'src/plugins/next.d.cts', 'src/plugins/webpack.d.cts'];
  try {
    execFileSync(process.execPath, [tsc, ...args], { cwd: root, stdio: 'pipe' });
  } catch (err) {
    assert.fail(String(err.stdout || err.stderr || err.message));
  }
});

test('a real 1.0 catalogue (react-catalogue era) still validates', () => {
  const doc = YAML.parse(fs.readFileSync(path.join(root, 'test/fixtures/catalogue-1.0.yaml'), 'utf8'));
  assert.equal(doc.catalogue, '1.0');
  assert.deepEqual(validateCatalogue(doc), { valid: true, errors: [] });
});
