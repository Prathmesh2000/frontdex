import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const BIN = path.resolve(import.meta.dirname, '../bin/frontdex.js');
const EXAMPLE = path.resolve(import.meta.dirname, '../examples/next-app');
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [BIN, ...args, '--json', '-C', EXAMPLE], { encoding: 'utf8' }));

test('--json gives structured output for query commands', () => {
  assert.equal(cli('show', 'Button').file, 'src/components/ui/Button.tsx');
  const impact = cli('impact', 'ProductCard');
  assert.ok(impact.direct.length && impact.pages.includes('/products'));
  assert.ok(cli('query', 'uses:Button').some((m) => m.id === 'Header'));
  const health = cli('health', '--severity', 'high');
  assert.ok(health.totals.high > 0 && health.issues.every((i) => i.severity === 'high'));
  assert.equal(cli('tokens', 'danger').drift[0].token, '--danger');
  assert.ok(cli('hooks', 'useToast').useToast.usedBy.includes('ProfileForm'));
  assert.equal(cli('check').upToDate, true);
});

test('doctor reports what was detected, with hints for what is missing', () => {
  const checks = cli('doctor');
  const by = (area) => checks.filter((c) => c.area === area);
  assert.match(by('routing')[0].message, /13 page\(s\) via next-app/);
  assert.match(by('files')[0].message, /source file\(s\)/);
  assert.ok(checks.every((c) => ['ok', 'info', 'warn', 'error'].includes(c.status)));
  assert.ok(!checks.some((c) => c.status === 'error'));
});
