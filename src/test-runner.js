import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

/*
 * Runs one catalogued test file (optionally one case) with the project's own runner, for `frontdex serve`.
 *
 *   request {file, title?, kind, confirm?} → testCommand()  validates against catalogue.tests, builds argv
 *                                          → createTestRuns().start()  spawns node <runner's JS bin> ...argv
 *                                          → output buffered per run, streamed to subscribers (SSE in server.js)
 *
 * No shell is involved: the runner's own JS entry point is resolved from the project's node_modules and started with
 * the current Node binary, and every argument is a separate argv item. `npx …` is only the human-readable form.
 */

// Each runner's CLI entry point inside its package, and how it takes a file and a test-name filter.
const RUNNERS = {
  jest: { bin: 'jest/bin/jest.js', args: (file, title) => ['--runTestsByPath', file, '--watchAll=false', ...(title ? ['-t', title] : [])] },
  vitest: { bin: 'vitest/vitest.mjs', args: (file, title) => ['run', file, ...(title ? ['-t', title] : [])] },
  // Playwright reads file arguments as regular expressions over the path.
  playwright: { bin: '@playwright/test/cli.js', args: (file, title) => ['test', escapeRegex(file), ...(title ? ['-g', title] : [])] },
  // Cypress has no built-in test-name filter: a case runs its whole spec.
  cypress: { bin: 'cypress/bin/cypress', args: (file) => ['run', '--spec', file] },
};
const MAX_LOG = 2_000_000;
const TIMEOUT_MS = 30 * 60_000;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A case's full name as runners match it: describe titles and the test title joined by spaces. */
export const caseName = (c) => [...(c.describe ?? []), c.title].join(' ');

/**
 * Validates a run request against the catalogue's tests section and builds the command.
 * Returns { runner, cwd (absolute), bin, args, display } or { error, status, needsConfirm? }.
 */
export function testCommand(catalogue, root, { file, title, kind, confirm } = {}) {
  const suites = catalogue?.tests?.suites ?? {};
  if (typeof file !== 'string' || !Object.hasOwn(suites, file)) return { error: `Not a catalogued test file: ${file}`, status: 404 };
  const suite = suites[file];
  if (kind !== undefined && kind !== suite.kind) return { error: `${file} is a ${suite.kind} suite, not ${kind}`, status: 400 };
  const spec = RUNNERS[suite.runner];
  if (!spec) return { error: `No known test runner for ${file}`, status: 400 };
  if (title !== undefined && title !== null && title !== '') {
    // Only names the scanner found: the filter is a regex to the runner, so it is escaped and anchored to one case.
    const names = new Set([...suite.cases.map(caseName), ...suite.cases.flatMap((c) => (c.describe ?? []).map((_, i) => c.describe.slice(0, i + 1).join(' ')))]);
    if (typeof title !== 'string' || !names.has(title)) return { error: `No test named "${title}" in ${file}`, status: 404 };
  }
  // E2E specs drive a real app and may create or delete real data: the caller must confirm explicitly.
  if (suite.kind === 'e2e' && confirm !== true) return { error: 'E2E runs need confirm: true', status: 409, needsConfirm: true };
  const cwd = path.resolve(root, suite.cwd ?? '.');
  const target = path.relative(cwd, path.resolve(root, file)).split(path.sep).join('/');
  const safeTarget = target.startsWith('-') ? `./${target}` : target;
  // Jest/Vitest match against "describe … test"; a case is anchored at both ends, a describe block covers its children.
  const isCase = suite.cases.some((c) => caseName(c) === title);
  const filter = title ? `^${escapeRegex(title)}${isCase ? '$' : ' '}` : undefined;
  const args = spec.args(safeTarget, suite.runner === 'playwright' ? (title ? escapeRegex(title) : undefined) : filter);
  return { runner: suite.runner, cwd, bin: spec.bin, args, display: `npx ${suite.runner} ${args.map(quote).join(' ')}` };
}

const quote = (a) => (/^[\w./:=@^$-]+$/.test(a) ? a : `"${a.replace(/(["\\$`])/g, '\\$1')}"`);

/** The runner's JS entry point in the project's node_modules, or null when it is not installed there. */
export function resolveRunnerBin(cwd, bin) {
  try {
    return createRequire(path.join(cwd, 'package.json')).resolve(bin);
  } catch {
    return null;
  }
}

/**
 * One test run at a time. start() returns { id } or { error, status }; subscribe(id, onChunk, onDone) replays the
 * output so far, then follows the run. Finished runs are kept (the last few) so a late subscriber still sees them.
 */
export function createTestRuns({ spawnFn = spawn, keep = 5 } = {}) {
  const runs = new Map();
  let active = null;

  const start = (cmd) => {
    if (active) return { error: 'A test run is already in progress', status: 409, id: active.id };
    const binPath = resolveRunnerBin(cmd.cwd, cmd.bin);
    if (!binPath) return { error: `${cmd.runner} is not installed in ${cmd.cwd} (run your package manager's install there first)`, status: 424 };
    const run = { id: randomUUID(), command: cmd.display, cwd: cmd.cwd, log: '', done: false, code: null, listeners: new Set() };
    const push = (chunk) => {
      const text = String(chunk);
      if (run.log.length < MAX_LOG) run.log += text;
      run.listeners.forEach((l) => l.onChunk(text));
    };
    const child = spawnFn(process.execPath, [binPath, ...cmd.args], { cwd: cmd.cwd, shell: false, windowsHide: true, env: { ...process.env, CI: 'true', FORCE_COLOR: '0' } });
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout?.on('data', push);
    child.stderr?.on('data', push);
    const finish = (code) => {
      if (run.done) return;
      clearTimeout(timer);
      Object.assign(run, { done: true, code });
      active = null;
      run.listeners.forEach((l) => l.onDone(code));
      run.listeners.clear();
    };
    child.on('error', (err) => {
      push(`\n${err.message}\n`);
      finish(-1);
    });
    child.on('close', (code) => finish(code));
    run.stop = () => child.kill();
    runs.set(run.id, run);
    active = run;
    // Keep only the last few runs' output.
    for (const id of [...runs.keys()].slice(0, Math.max(0, runs.size - keep))) if (runs.get(id).done) runs.delete(id);
    return { id: run.id, command: run.command };
  };

  const subscribe = (id, onChunk, onDone) => {
    const run = runs.get(id);
    if (!run) return null;
    if (run.log) onChunk(run.log);
    if (run.done) {
      onDone(run.code);
      return () => {};
    }
    const l = { onChunk, onDone };
    run.listeners.add(l);
    return () => run.listeners.delete(l);
  };

  const stop = (id) => {
    const run = runs.get(id);
    if (!run || run.done) return false;
    run.stop();
    return true;
  };

  return { start, subscribe, stop, get active() {
    return active?.id ?? null;
  } };
}
