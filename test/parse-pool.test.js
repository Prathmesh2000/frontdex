import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadMany, parseOne } from '../src/scanner/parse-pool.js';

test('worker-parsed modules equal main-thread parses, in job order', () => {
  const dir = path.resolve(import.meta.dirname, '../examples/next-app/src');
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.(tsx?|jsx?)$/.test(f)).map((f) => path.join(dir, f));
  // Repeat the sample files past the worker threshold so the batch is split across threads.
  const jobs = Array.from({ length: Math.ceil(500 / files.length) }, () => files).flat().map((f) => [f, undefined]);
  const pooled = loadMany(jobs);
  assert.equal(pooled.length, jobs.length);
  jobs.forEach(([file], i) => assert.deepEqual(pooled[i].mod, parseOne(file, fs.readFileSync(file, 'utf8')), file));
  // A matching previous hash skips the parse.
  assert.equal(loadMany([[files[0], pooled[0].hash]])[0].mod, undefined);
});
