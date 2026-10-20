import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { listProjectFiles } from '../files.js';

/*
 * Tests mapped onto the catalogue: unit tests (Jest, Vitest + Testing Library) to the components they render, E2E specs
 * (Playwright, Cypress) to the pages they visit and the components whose text, labels or test ids they touch.
 *
 *   discover  test files under the scan root (the default excludes hide them from the component scan), the dirs in
 *             config `tests.dirs` (may sit outside the root, e.g. "../tests"), and E2E folders found next to the root
 *             (see E2E_DIRS)
 *   parse     each test file with Babel: describe/it/test titles, imports, rendered JSX, page.goto/cy.visit, locators
 *   link      imports through the scanner's own resolver to component ids; URLs to page routes; locators to the
 *             literal text each component renders (record.texts, collected in parse-file.js staticTexts())
 *
 * Output is the catalogue's `tests` section plus `testedBy` on the components a suite covers.
 */

const TEST_FILE = /\.(test|spec|cy)\.[cm]?[jt]sx?$/;
const IN_TESTS_DIR = /(^|\/)__tests__\/.*\.[cm]?[jt]sx?$/;
// Default excludes that exist only to keep tests out of the component scan; dropped when listing tests.
const TEST_EXCLUDE = /test|spec/;
// Auto-detected E2E folders, looked for in the scan root and, when it is a project root itself (package.json or .git),
// its parent: a frontend/ scanned on its own often has the repo's Playwright suite one level up in tests/ or e2e/.
// Files found there count only when they are E2E specs, so a backend's unit tests in ../tests are not adopted.
const E2E_DIRS = ['e2e', 'tests', 'test', 'playwright', 'cypress'];
const DESCRIBE = /^(describe|context|suite)$/;
const CASE = /^(it|test|specify)$/;
const MODIFIERS = new Set(['only', 'skip', 'todo', 'concurrent', 'serial', 'parallel', 'fixme', 'fails', 'each', 'failing']);
const MAX_LOCATOR_MATCHES = 3;
const CONFIGS = {
  jest: /^jest\.config\.[cm]?[jt]s(on)?$/,
  vitest: /^vitest\.(config|workspace)\.[cm]?[jt]s$/,
  playwright: /^playwright\.config\.[cm]?[jt]s$/,
  cypress: /^cypress\.config\.[cm]?[jt]s$|^cypress\.json$/,
};
const PACKAGES = { jest: ['jest', 'react-scripts'], vitest: ['vitest'], playwright: ['@playwright/test', 'playwright'], cypress: ['cypress'] };

/** Test files to map: [{ abs, rel, e2eOnly }]; `e2eOnly` marks files from auto-detected folders. */
export function discoverTests(config, rel) {
  const exclude = config.exclude.filter((g) => !TEST_EXCLUDE.test(g));
  const isTest = (f) => TEST_FILE.test(f) || IN_TESTS_DIR.test(f.split(path.sep).join('/'));
  const found = new Map();
  const add = (root, include, e2eOnly) => {
    for (const abs of listProjectFiles({ ...config, root, include, exclude, html: false }).sources) {
      if (isTest(abs) && !found.has(abs)) found.set(abs, { abs, rel: rel(abs), e2eOnly });
    }
  };
  add(config.root, config.include, false);
  for (const d of config.tests?.dirs ?? []) {
    const abs = path.resolve(config.root, d);
    if (fs.existsSync(abs)) add(abs, ['.'], false);
  }
  const parent = path.dirname(config.root);
  const isProject = (d) => fs.existsSync(path.join(d, 'package.json')) || fs.existsSync(path.join(d, '.git'));
  const bases = [config.root, ...(parent !== config.root && isProject(config.root) && isProject(parent) ? [parent] : [])];
  for (const base of bases) {
    for (const name of E2E_DIRS) {
      const dir = path.join(base, name);
      if (fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) add(dir, ['.'], true);
    }
  }
  return [...found.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Nearest folder at or above `dir` with a package.json or a runner config: where the runner is started. */
function projectDirOf(dir, stop) {
  for (let d = dir; ; d = path.dirname(d)) {
    let names = [];
    try {
      names = fs.readdirSync(d);
    } catch {}
    if (names.includes('package.json') || names.some((n) => Object.values(CONFIGS).some((re) => re.test(n)))) return d;
    if (d === stop || path.dirname(d) === d) return null;
  }
}

/** Runners a project folder sets up: { name: { config? , from: [...] } } from package.json and config files. */
function runnersIn(dir) {
  const out = {};
  const note = (name, from, extra) => {
    out[name] ??= { from: [] };
    if (!out[name].from.includes(from)) out[name].from.push(from);
    Object.assign(out[name], extra);
  };
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, list] of Object.entries(PACKAGES)) if (list.some((p) => deps[p])) note(name, 'package.json');
  for (const script of Object.values(pkg.scripts ?? {})) {
    for (const name of Object.keys(PACKAGES)) if (new RegExp(`(^|[\\s/])${name}(\\s|$)`).test(script)) note(name, 'scripts');
  }
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {}
  for (const [name, re] of Object.entries(CONFIGS)) {
    const file = names.find((n) => re.test(n));
    if (file) note(name, 'config', { config: file });
  }
  return out;
}

/**
 * Maps the project's tests onto the catalogue. Sets `testedBy` on covered components and returns the `tests` section,
 * or undefined when the project has no test files. `resolveExport` comes from graph.js (follows barrels/re-exports).
 */
export function mapTests({ config, entries, components, pages, hooks, modules, rel, resolveImport, resolveExport }) {
  // ponytail: test files are re-read and re-parsed on every full scan (~0.6 s for 138 files); cache by mtime in the
  // parse cache if that shows up in watch-mode timings.
  const files = discoverTests(config, rel);
  if (!files.length) return undefined;
  const textIndex = buildTextIndex(entries);
  const routes = Object.entries(pages).map(([key, p]) => ({ key, segs: routeSegments(key.replace(/ \(.*\)$/, '')), components: new Set(p.components ?? []) }));
  const runners = {};
  const dirRunners = new Map();
  const stop = path.dirname(config.root);
  const suites = {};

  for (const { abs, rel: file, e2eOnly } of files) {
    let parsed;
    try {
      parsed = parseTestFile(abs);
    } catch (err) {
      suites[file] = { kind: 'unit', error: String(err.message).split('\n')[0], cases: [] };
      continue;
    }
    const projectDir = projectDirOf(path.dirname(abs), stop) ?? config.root;
    if (!dirRunners.has(projectDir)) dirRunners.set(projectDir, runnersIn(projectDir));
    const available = dirRunners.get(projectDir);
    const runner = pickRunner(parsed, available, file);
    const kind = runner === 'playwright' || runner === 'cypress' ? 'e2e' : 'unit';
    if (e2eOnly && kind !== 'e2e') continue;
    const cwd = rel(projectDir) || '.';
    if (runner) {
      const key = runners[runner] && runners[runner].cwd !== cwd ? `${runner} (${cwd})` : runner;
      runners[key] ??= { cwd, ...(available[runner]?.config && { config: available[runner].config }), from: available[runner]?.from ?? ['import'] };
    }
    const suite = { kind, ...(runner && { runner }), cwd, cases: parsed.cases };
    if (kind === 'unit') Object.assign(suite, mapUnit(parsed, abs, { resolveImport, resolveExport, modules, hooks, rel }));
    else Object.assign(suite, mapE2E(parsed, { routes, textIndex }));
    suites[file] = compactSuite(suite);
  }

  for (const [file, s] of Object.entries(suites)) {
    for (const id of s.components ?? []) {
      const c = components[id];
      if (c && !(c.testedBy ??= []).includes(file)) c.testedBy.push(file);
    }
  }
  return Object.keys(suites).length ? { runners, suites } : undefined;
}

function compactSuite(s) {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));
}

function pickRunner(parsed, available, file) {
  const from = parsed.imports;
  if (from.has('@playwright/test') || from.has('playwright/test')) return 'playwright';
  if (parsed.usesCy || /\.cy\.[cm]?[jt]sx?$/.test(file)) return 'cypress';
  if (from.has('vitest')) return 'vitest';
  if (available.jest && available.vitest) return parsed.usesVi ? 'vitest' : 'jest';
  if (available.vitest) return 'vitest';
  if (available.jest) return 'jest';
  // A spec in a project that installs only Playwright/Cypress belongs to it even without the import (globals).
  if (available.playwright && !available.cypress) return 'playwright';
  if (available.cypress) return 'cypress';
  return undefined;
}

// ---------- parsing ----------

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'range']);

/** Depth-first walk calling `visit(node, parents)`; `visit` returning false skips the node's children. */
function walk(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parents) === false) return;
  parents.push(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) for (const x of v) walk(x, visit, parents);
    else if (v && typeof v.type === 'string') walk(v, visit, parents);
  }
  parents.pop();
}

/** `describe.only.each(...)` → ['describe', 'only', 'each']; null when the callee is not a plain member chain. */
function calleeChain(node) {
  const out = [];
  for (let n = node; n; ) {
    if (n.type === 'Identifier') return [n.name, ...out];
    if (n.type === 'ThisExpression') return ['this', ...out];
    if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier') {
      out.unshift(n.property.name);
      n = n.object;
    } else if (n.type === 'CallExpression') n = n.callee; // describe.each([...])('title', fn)
    else return null;
  }
  return null;
}

/** The parsed facts of one test file (see mapTests). */
export function parseTestFile(file, code = fs.readFileSync(file, 'utf8')) {
  const ext = path.extname(file);
  const plugins = ['decorators-legacy', ...(/\.[cm]?ts$/.test(ext) ? ['typescript'] : /\.tsx$/.test(ext) ? ['typescript', 'jsx'] : ['jsx'])];
  const ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true });
  const src = (n) => code.slice(n.start, n.end);
  const imports = new Map(); // source → [{ local, imported }]
  const locals = new Map(); // local → { source, imported }
  const mocked = new Set();
  const consts = {};
  const jsx = new Map(); // element name → first line
  const hookCalls = new Map();
  const cases = [];
  const visits = [];
  const locators = [];
  let usesCy = false;
  let usesVi = false;

  for (const stmt of ast.program.body) {
    if (stmt.type !== 'ImportDeclaration' || stmt.importKind === 'type') continue;
    const list = imports.get(stmt.source.value) ?? imports.set(stmt.source.value, []).get(stmt.source.value);
    for (const s of stmt.specifiers) {
      const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : (s.imported.name ?? s.imported.value);
      list.push({ local: s.local.name, imported });
      locals.set(s.local.name, { source: stmt.source.value, imported });
    }
  }
  // Same-file string constants, for page.goto(url) with `const url = '...'` (any scope; the first declaration wins).
  walk(ast.program, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && consts[n.id.name] === undefined) {
      const v = staticString(n.init, consts, src);
      if (v !== undefined && !v.unresolved) consts[n.id.name] = v.text;
    }
  });

  const titleOf = (arg) => {
    if (!arg) return null;
    if (arg.type === 'StringLiteral') return arg.value;
    if (arg.type === 'TemplateLiteral') return arg.quasis.map((q, i) => q.value.cooked + (arg.expressions[i] ? `\${${src(arg.expressions[i])}}` : '')).join('');
    return null;
  };
  const describeStack = [];
  const visit = (n, parents) => {
    if (n.type === 'JSXOpeningElement') {
      const name = jsxName(n.name);
      if (name && /^[A-Z]/.test(name) && !jsx.has(name)) jsx.set(name, n.loc?.start.line);
      return;
    }
    if (n.type !== 'CallExpression') return;
    const chain = calleeChain(n.callee);
    const head = chain?.[0];
    if (head === 'cy') usesCy = true;
    if (head === 'vi') usesVi = true;
    if ((head === 'jest' || head === 'vi') && chain[1] === 'mock' && n.arguments[0]?.type === 'StringLiteral') mocked.add(n.arguments[0].value);
    if (chain && (chain.at(-1) === 'renderHook' || head === 'renderHook')) {
      walk(n.arguments[0], (x) => {
        const name = x.type === 'Identifier' ? x.name : null;
        if (name && /^use[A-Z0-9]/.test(name) && !hookCalls.has(name)) hookCalls.set(name, n.loc?.start.line);
      });
    }
    if (chain) {
      // test.describe(...) (Playwright) and describe(...); test(...) / it(...), each with modifiers.
      const words = chain.filter((w) => !MODIFIERS.has(w));
      const isDescribe = words.length >= 1 && (DESCRIBE.test(words.at(-1)) && (words.length === 1 || CASE.test(words[0])));
      const isCase = !isDescribe && words.length === 1 && CASE.test(words[0]);
      // describe.each([...])('title') puts the title on the outer call; skip the inner describe.each([...]) call.
      const outer = n.callee.type === 'CallExpression' || !chain.includes('each');
      if ((isDescribe || isCase) && outer && !(n.arguments.length === 0)) {
        const title = titleOf(n.arguments[0]);
        if (title != null && isCase) cases.push({ title, line: n.loc?.start.line, ...(describeStack.length && { describe: describeStack.map((d) => d.title) }) });
        if (title != null && isDescribe) {
          describeStack.push({ title, node: n });
          for (const a of n.arguments.slice(1)) walk(a, visit, parents);
          describeStack.pop();
          return false;
        }
      }
      const last = chain.at(-1);
      if ((last === 'goto' && chain.length >= 2) || (head === 'cy' && last === 'visit')) {
        const arg = n.arguments[0];
        const v = arg && staticString(arg, consts, src);
        if (v) visits.push({ url: v.text, line: n.loc?.start.line, ...(v.unresolved && { partial: true }) });
      }
      const loc = locatorOf(chain, n.arguments, consts, src);
      if (loc) locators.push({ ...loc, line: n.loc?.start.line });
    }
  };
  walk(ast.program, visit);
  return { imports, locals, mocked, jsx, hookCalls, cases, visits, locators, usesCy, usesVi };
}

function jsxName(n) {
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') {
    const o = jsxName(n.object);
    return o && `${o}.${n.property.name}`;
  }
  return null;
}

/**
 * A string value from a literal, a template literal or `a + b`, resolving identifiers through same-file `consts`.
 * Parts it cannot resolve are kept as `{source}` and flagged `unresolved`. undefined when nothing static is there.
 */
function staticString(node, consts, src) {
  while (node?.type === 'TSAsExpression' || node?.type === 'TSSatisfiesExpression') node = node.expression;
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return { text: node.value };
  if (node.type === 'Identifier' && consts[node.name] !== undefined) return { text: consts[node.name] };
  if (node.type === 'TemplateLiteral') {
    let unresolved = false;
    const text = node.quasis
      .map((q, i) => {
        const e = node.expressions[i];
        if (!e) return q.value.cooked;
        const v = staticString(e, consts, src);
        if (!v || v.unresolved) unresolved = true;
        return q.value.cooked + (v && !v.unresolved ? v.text : `{${src(e)}}`);
      })
      .join('');
    return { text, ...(unresolved && { unresolved }) };
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const a = staticString(node.left, consts, src) ?? { text: `{${src(node.left)}}`, unresolved: true };
    const b = staticString(node.right, consts, src) ?? { text: `{${src(node.right)}}`, unresolved: true };
    if (!a.text && !b.text) return undefined;
    return { text: a.text + b.text, ...((a.unresolved || b.unresolved) && { unresolved: true }) };
  }
  return undefined;
}

/** A matcher value: a static string, or a regex literal as { regex, flags }. */
function matcherValue(node, consts, src) {
  if (node?.type === 'RegExpLiteral') return { regex: node.pattern, flags: node.flags };
  const v = staticString(node, consts, src);
  return v && !v.unresolved ? { text: v.text } : null;
}

const ATTR_SELECTOR = /\[\s*data-(testid|test-id|test|cy)\s*=\s*["']?([^"'\]]+)["']?\s*\]/;

/** One Playwright / Testing Library / Cypress locator call: { by, role?, value, source }. */
function locatorOf(chain, args, consts, src) {
  const last = chain.at(-1);
  const by = { getByRole: 'role', getByText: 'text', getByLabel: 'label', getByLabelText: 'label', getByPlaceholder: 'placeholder', getByPlaceholderText: 'placeholder', getByTestId: 'testid', getByTitle: 'title', getByAltText: 'title' }[last.replace(/^(find|query)(All)?By/, 'getBy').replace(/^getAllBy/, 'getBy')];
  const source = `${last}(${args.map(src).join(', ')})`.slice(0, 160);
  if (by === 'role') {
    const role = args[0]?.type === 'StringLiteral' ? args[0].value : null;
    const opts = args[1]?.type === 'ObjectExpression' ? args[1].properties.find((p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'name') : null;
    const value = opts && matcherValue(opts.value, consts, src);
    return role ? { by, role, ...(value && { value }), source } : null;
  }
  if (by) {
    const value = matcherValue(args[0], consts, src);
    return value ? { by, value, source } : null;
  }
  // locator('[data-testid=x]'), locator('text=Save'), cy.get('[data-cy=x]'), cy.contains('Save') / ('button', 'Save').
  if (last === 'locator' || (chain[0] === 'cy' && last === 'get')) {
    const sel = staticString(args[0], consts, src);
    if (!sel || sel.unresolved) return null;
    const attr = sel.text.match(ATTR_SELECTOR);
    if (attr) return { by: 'testid', value: { text: attr[2].trim() }, source };
    const t = sel.text.match(/^text=["']?(.+?)["']?$/);
    if (t) return { by: 'text', value: { text: t[1] }, source };
    return null;
  }
  if (chain[0] === 'cy' && last === 'contains') {
    const value = matcherValue(args.length > 1 && args[1].type !== 'ObjectExpression' ? args[1] : args[0], consts, src);
    return value ? { by: 'text', value, source } : null;
  }
  return null;
}

// ---------- unit mapping ----------

function mapUnit(parsed, abs, { resolveImport, resolveExport, modules, hooks, rel }) {
  const comps = new Set();
  const hookIds = new Set();
  const mockedTargets = new Set([...parsed.mocked].map((s) => resolveImport(abs, s)).filter(Boolean));
  const target = (source) => {
    const t = resolveImport(abs, source);
    return t && !mockedTargets.has(t) && modules.has(t) ? t : null;
  };
  for (const name of parsed.jsx.keys()) {
    const [head, member] = name.split('.');
    const imp = parsed.locals.get(head);
    const t = imp && target(imp.source);
    if (!t) continue;
    const exported = imp.imported === '*' ? member : imp.imported;
    const found = exported && resolveExport(t, exported);
    if (found?.id) comps.add(found.id);
  }
  for (const name of parsed.hookCalls.keys()) {
    const imp = parsed.locals.get(name);
    const t = imp && target(imp.source);
    if (!t) continue;
    const file = rel(t);
    const inFile = Object.entries(hooks).filter(([, h]) => h.file === file).map(([id]) => id);
    const wanted = imp.imported === 'default' ? name : imp.imported;
    const id = inFile.find((h) => h === wanted || h.startsWith(`${wanted}@`)) ?? (imp.imported === 'default' && inFile.length === 1 ? inFile[0] : undefined);
    if (id) hookIds.add(id);
  }
  return { components: [...comps].sort(), hooks: [...hookIds].sort() };
}

// ---------- E2E mapping ----------

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Component texts by kind, for locator lookups: Map<kind, Map<normalized text, Set<id>>> plus a flat list for regexes. */
function buildTextIndex(entries) {
  const byKind = new Map();
  const all = [];
  for (const { c } of entries) {
    for (const [kind, values] of Object.entries(c.texts ?? {})) {
      const m = byKind.get(kind) ?? byKind.set(kind, new Map()).get(kind);
      for (const v of values) {
        const k = norm(v);
        (m.get(k) ?? m.set(k, new Set()).get(k)).add(c.id);
        all.push({ kind, text: v, id: c.id });
      }
    }
  }
  return { byKind, all };
}

// Which component text kinds each locator looks at, and how strongly a hit identifies the component.
const LOOKUP = {
  testid: { kinds: ['testid'], confidence: 'high' },
  // A textbox's accessible name falls back to its placeholder.
  role: { kinds: ['text', 'label', 'title', 'placeholder'], confidence: 'medium' },
  label: { kinds: ['label', 'text'], confidence: 'medium' },
  placeholder: { kinds: ['placeholder'], confidence: 'medium' },
  title: { kinds: ['title'], confidence: 'medium' },
  text: { kinds: ['text', 'label', 'title'], confidence: 'low' },
};

function lookupLocator(loc, textIndex) {
  const { kinds } = LOOKUP[loc.by];
  const hits = new Map(); // id → the component text that matched
  if (loc.value.text != null) {
    const k = norm(loc.value.text);
    for (const kind of kinds) for (const id of textIndex.byKind.get(kind)?.get(k) ?? []) if (!hits.has(id)) hits.set(id, loc.value.text);
  } else {
    let re;
    try {
      re = new RegExp(loc.value.regex, loc.value.flags.replace(/[gy]/g, ''));
    } catch {
      return hits;
    }
    for (const t of textIndex.all) if (kinds.includes(t.kind) && !hits.has(t.id) && re.test(t.text)) hits.set(t.id, t.text);
  }
  return hits;
}

/** Route pattern segments: { lit } for fixed text, { param } for :id / [id] / $id, { rest } for * and [...slug]. */
function routeSegments(route) {
  return route
    .split('/')
    .filter(Boolean)
    .map((s) => (s === '*' || s === '$' || /^\[{1,2}\.\.\./.test(s) ? { rest: true } : /^:|^\[|^\$|^\{/.test(s) ? { param: true } : { lit: s }));
}

/** Score of `url` (path segments) against a route, or -1. Literal hits weigh most; a catch-all least. */
function routeScore(urlSegs, segs) {
  let score = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.rest) return score + 0.5;
    const u = urlSegs[i];
    if (u === undefined) return -1;
    if (s.param) score += 1;
    else if (s.lit === u) score += 3;
    else return -1;
  }
  return urlSegs.length === segs.length ? score : -1;
}

/** The path of a visited URL: origin, a leading base-URL expression (`{baseUrl}/login`), query and hash removed. */
export function urlPath(url) {
  let u = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/^\{[^}]*\}(?=\/|$)/, '');
  u = u.replace(/[?#].*$/, '');
  return u.startsWith('/') || u === '' ? u || '/' : null;
}

function mapE2E(parsed, { routes, textIndex }) {
  const matches = [];
  const unmatched = [];
  // The same visit or locator repeated later in a spec is one finding (at its first line).
  const seen = new Set();
  const once = (key) => !seen.has(key) && seen.add(key);
  const pageKeys = new Set();
  for (const v of parsed.visits) {
    if (!once(`visit ${v.url}`)) continue;
    const p = urlPath(v.url);
    if (p == null) {
      unmatched.push({ what: `visit ${v.url}`, line: v.line, why: 'URL is not a static path' });
      continue;
    }
    const urlSegs = p.split('/').filter(Boolean);
    let best = -1;
    let hits = [];
    for (const r of routes) {
      const s = routeScore(urlSegs, r.segs);
      if (s > best) (best = s), (hits = [r]);
      else if (s === best && s >= 0) hits.push(r);
    }
    if (best < 0) {
      unmatched.push({ what: `visit ${v.url}`, line: v.line, why: 'no catalogue page matches this path' });
      continue;
    }
    for (const r of hits) {
      pageKeys.add(r.key);
      matches.push({ kind: 'page', target: r.key, via: `visit ${v.url}`, line: v.line, confidence: v.partial ? 'medium' : 'high', reason: `URL path ${p} matches route ${r.key}` });
    }
  }
  const onPages = new Set(routes.filter((r) => pageKeys.has(r.key)).flatMap((r) => [...r.components]));
  const comps = new Set();
  for (const loc of parsed.locators) {
    if (!loc.value || !once(loc.source)) continue;
    const hits = lookupLocator(loc, textIndex);
    let ids = [...hits.keys()];
    // A common label ("Save", "Cancel") hits many components: prefer those on the pages this spec visits, and give up
    // when it stays ambiguous rather than claim coverage for a dozen components.
    // Plain text is too weak to claim a component off those pages; a role name or test id may still point to a page
    // reached by clicking rather than by URL.
    const narrowed = ids.filter((id) => onPages.has(id));
    if (!ids.length) {
      unmatched.push({ what: loc.source, line: loc.line, why: 'no component renders this text, label or test id literally' });
      continue;
    }
    if (narrowed.length) ids = narrowed;
    else if (onPages.size && LOOKUP[loc.by].confidence === 'low') {
      unmatched.push({ what: loc.source, line: loc.line, why: `text found only in components off the visited pages (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''})` });
      continue;
    }
    if (ids.length > MAX_LOCATOR_MATCHES) {
      unmatched.push({ what: loc.source, line: loc.line, why: `ambiguous: ${ids.length} components render it` });
      continue;
    }
    const { confidence } = LOOKUP[loc.by];
    for (const id of ids.sort()) {
      comps.add(id);
      matches.push({ kind: 'component', target: id, via: loc.source, line: loc.line, confidence, reason: `${loc.by === 'testid' ? 'test id' : loc.by === 'role' ? `role ${loc.role} named` : loc.by} "${hits.get(id)}" appears in ${id}` });
    }
  }
  return { pages: [...pageKeys].sort(), components: [...comps].sort(), matches, unmatched: unmatched.slice(0, 50) };
}
