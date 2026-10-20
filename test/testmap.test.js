import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTools, loadConfig, scanProject, validateCatalogue } from '../src/index.js';
import { urlPath } from '../src/scanner/analyzers/testmap.js';
import { createApp } from '../src/server.js';
import { testCommand } from '../src/test-runner.js';

// web/ is the scan root (Jest + RTL); the Playwright suite sits one level up in e2e/ (auto-detected) and qa/ (config tests.dirs).
const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/tests-app');
const web = (root = FIXTURE) => loadConfig(path.join(root, 'web'));
const { catalogue } = scanProject(web());
const suites = catalogue.tests.suites;
// scan() and the tools write the catalogue and knowledge base into the project: those tests use a copy.
const copy = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdx-tests-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
};

test('unit tests map to the components they render and the hooks they renderHook()', () => {
  const unit = suites['src/components/__tests__/Counter.test.jsx'];
  assert.equal(unit.kind, 'unit');
  assert.equal(unit.runner, 'jest');
  assert.deepEqual(unit.components, ['Counter']);
  assert.deepEqual(unit.hooks, ['useToggle']);
  assert.deepEqual(
    unit.cases.map((c) => [...(c.describe ?? []), c.title].join(' > ')),
    ['Counter > starts at zero', 'Counter > when clicked > increments', 'useToggle flips'],
  );
  assert.ok(catalogue.components.Counter.testedBy.includes('src/components/__tests__/Counter.test.jsx'));
});

test('E2E specs outside the scan root map to pages by URL and to components by role, placeholder and test id', () => {
  assert.deepEqual(catalogue.tests.runners.playwright, { cwd: '..', from: ['package.json'] });
  const spec = suites['../e2e/users.spec.ts'];
  assert.equal(spec.kind, 'e2e');
  assert.deepEqual(spec.pages, ['/', '/users/:id']);
  assert.deepEqual(spec.components, ['Counter', 'UserPage']);
  const m = (via) => spec.matches.find((x) => x.via === via);
  assert.equal(m("getByRole('button', { name: 'Save user' })").confidence, 'medium');
  assert.equal(m("getByTestId('counter-value')").confidence, 'high');
  assert.equal(m('visit http://localhost:3000/users/42').target, '/users/:id');
  assert.match(spec.unmatched[0].what, /Saved somewhere else/);
  // tests.dirs: an unresolved base URL still leaves a path to match.
  assert.deepEqual(suites['../qa/flows.spec.ts'].pages, ['/users/:id']);
  assert.ok(catalogue.components.UserPage.testedBy.includes('../e2e/users.spec.ts'));
  // Literal texts are a parse-time index, not catalogue content.
  assert.ok(Object.values(catalogue.components).every((c) => !c.texts));
  assert.deepEqual(validateCatalogue(catalogue), { valid: true, errors: [] });
});

test('urlPath strips origins and base-URL expressions', () => {
  assert.equal(urlPath('https://qa.example.com/home/projects/1/test-groups?x=1'), '/home/projects/1/test-groups');
  assert.equal(urlPath('{baseUrl}/login'), '/login');
  assert.equal(urlPath('{url}'), '/');
  assert.equal(urlPath('relative/path'), null);
});

test('testCommand builds argv from the catalogue only, and E2E needs confirm', () => {
  const root = web().root;
  const unit = testCommand(catalogue, root, { file: 'src/components/__tests__/Counter.test.jsx', title: 'Counter when clicked increments', kind: 'unit' });
  assert.deepEqual(unit.args, ['--runTestsByPath', 'src/components/__tests__/Counter.test.jsx', '--watchAll=false', '-t', '^Counter when clicked increments$']);
  assert.equal(unit.cwd, root);
  assert.equal(testCommand(catalogue, root, { file: 'src/components/__tests__/Counter.test.jsx', title: 'Counter' }).args.at(-1), '^Counter ');
  assert.equal(testCommand(catalogue, root, { file: '../../../etc/passwd' }).status, 404);
  assert.equal(testCommand(catalogue, root, { file: 'src/components/__tests__/Counter.test.jsx', title: '.*' }).status, 404);
  assert.equal(testCommand(catalogue, root, { file: 'src/components/__tests__/Counter.test.jsx', kind: 'e2e' }).status, 400);
  const e2e = testCommand(catalogue, root, { file: '../e2e/users.spec.ts', kind: 'e2e' });
  assert.equal(e2e.needsConfirm, true);
  const ok = testCommand(catalogue, root, { file: '../e2e/users.spec.ts', title: 'Users saves a user', confirm: true });
  assert.deepEqual(ok.args, ['test', 'e2e/users\\.spec\\.ts', '-g', 'Users saves a user']);
  assert.equal(ok.cwd, FIXTURE);
});

test('catalogue_tests tells agents which tests cover a component and how to run them', () => {
  const dir = copy();
  const { tools } = createTools({ ...web(dir), history: { enabled: false } });
  const out = tools.catalogue_tests({ name: 'Counter' });
  assert.match(out, /`src\/components\/__tests__\/Counter\.test\.jsx` unit\/jest/);
  assert.match(out, /run: `npx jest --runTestsByPath src\/components\/__tests__\/Counter\.test\.jsx --watchAll=false`/);
  assert.match(out, /`\.\.\/e2e\/users\.spec\.ts` e2e\/playwright .*\n.*may create or delete data/);
  assert.match(tools.catalogue_tests({ route: '/users/:id' }), /qa\/flows\.spec\.ts/);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** POST/GET against an app served on a random loopback port. */
async function withServer(config, fn) {
  const app = createApp(config, { regenerate: true, log: () => {} });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, headers = { 'content-type': 'application/json' }) => fetch(base + p, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await fn({ base, post });
  } finally {
    server.close();
    app.close();
  }
}

test('POST /api/tests/run refuses unknown files, E2E without confirm and non-JSON requests; runs a catalogued file', async () => {
  // A copy with a stand-in jest that prints the argv it was given; nothing in the fixture is executed for real.
  const dir = copy();
  const fake = path.join(dir, 'web/node_modules/jest/bin/jest.js');
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  fs.writeFileSync(path.join(dir, 'web/node_modules/jest/package.json'), '{"name":"jest","version":"0.0.0"}');
  fs.writeFileSync(fake, "setTimeout(() => { console.log('ARGV ' + JSON.stringify(process.argv.slice(2))); }, 300);\n");
  const config = { ...web(dir), history: { enabled: false }, agents: { enabled: false } };

  await withServer(config, async ({ base, post }) => {
    const listing = await (await fetch(`${base}/api/tests`)).json();
    assert.ok(listing.suites['src/components/__tests__/Counter.test.jsx']);
    assert.ok(listing.uncovered.includes('Home'));

    assert.equal((await post('/api/tests/run', { file: 'package.json' })).status, 404);
    const e2e = await post('/api/tests/run', { file: '../e2e/users.spec.ts', kind: 'e2e' });
    assert.equal(e2e.status, 409);
    assert.equal((await e2e.json()).needsConfirm, true);
    // A cross-site form can only send simple content types, and a page elsewhere sends its own Origin.
    assert.equal((await post('/api/tests/run', { file: 'src/components/__tests__/Counter.test.jsx' }, { 'content-type': 'text/plain' })).status, 403);
    assert.equal((await post('/api/tests/run', { file: 'src/components/__tests__/Counter.test.jsx' }, { 'content-type': 'application/json', origin: 'https://evil.example' })).status, 403);
    // Playwright is not installed in the copy: refused before anything is spawned.
    assert.equal((await post('/api/tests/run', { file: '../e2e/users.spec.ts', confirm: true })).status, 424);

    const started = await post('/api/tests/run', { file: 'src/components/__tests__/Counter.test.jsx', title: 'Counter starts at zero', kind: 'unit' });
    assert.equal(started.status, 202);
    const { id, command } = await started.json();
    assert.match(command, /^npx jest --runTestsByPath src\/components\/__tests__\/Counter\.test\.jsx/);
    assert.equal((await post('/api/tests/run', { file: 'src/components/__tests__/Counter.test.jsx' })).status, 409, 'one run at a time');

    const stream = await (await fetch(`${base}/api/tests/runs/${id}`)).text();
    const output = [...stream.matchAll(/^data: (".*")$/gm)].map((m) => JSON.parse(m[1])).join('');
    assert.match(output, /ARGV \["--runTestsByPath","src\/components\/__tests__\/Counter\.test\.jsx","--watchAll=false","-t","\^Counter starts at zero\$"\]/);
    assert.match(stream, /event: done\ndata: \{"code":0\}/);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
