import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { installAgents } from '../src/agents.js';
import { createHistory, createTools, flushSession, knowledgeDir, loadConfig, readCatalogue, scan } from '../src/index.js';

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcat-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/next-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$/.test(src) });
  return dir;
}

test('incremental scan re-parses only changed files and records history', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  const first = scan(config);
  assert.equal(first.delta.parsed, first.stats.files);
  assert.equal(first.commit.message, 'initial scan');

  const noop = scan(config);
  assert.equal(noop.delta.parsed, 0);
  assert.equal(noop.changed, false);
  assert.equal(noop.commit, null);

  const file = path.join(dir, 'src/features/products/ProductGrid.tsx');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('pageSize?: number;', 'pageSize?: number;\n  title?: string;'));
  const edit = scan(config, { message: 'add title' });
  assert.equal(edit.delta.parsed, 1);
  assert.deepEqual(edit.commit.summary.components, { added: 0, removed: 0, changed: 1 });
  assert.deepEqual(edit.commit.changes, [{ kind: 'components', key: 'ProductGrid', change: 'changed', details: [{ field: 'props', added: ['title'] }] }]);

  const history = createHistory(path.join(knowledgeDir(config), 'history'));
  assert.equal(history.log().length, 2);
  assert.ok(history.checkout(first.commit.id).catalogue.components.ProductGrid.props.pageSize);
  assert.equal(history.checkout(first.commit.id).catalogue.components.ProductGrid.props.title, undefined);
});

test('a file broken mid-edit keeps its last good version', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  scan(config);
  const file = path.join(dir, 'src/components/layout/Header.tsx');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('const [scrolled', 'const [x] = useState(0);\n  const [x] = useState(1);\n  const [scrolled'));
  const r = scan(config);
  assert.ok(r.catalogue.components.Header);
  assert.match(r.warnings[0], /kept last good version/);
  assert.equal(r.commit, null);
});

test('agent knowledge base mirrors source folders', () => {
  const dir = tempProject();
  scan(loadConfig(dir));
  const agent = path.join(dir, '.frontdex/agent');
  const index = fs.readFileSync(path.join(agent, 'INDEX.md'), 'utf8');
  assert.match(index, /\| `\/products\/\[id\]` \| ProductDetailPage/);
  assert.match(index, /\| redux:cart \| redux-slice \|/);
  assert.match(index, /HIGH memory-leak: HeroBanner/);
  const card = fs.readFileSync(path.join(agent, 'components/src/features/products.md'), 'utf8');
  assert.match(card, /## ProductCard[\s\S]*Props from ProductGrid: key=p\.id, product=p/);
  assert.match(card, /## ProductGrid[\s\S]*API GET `\/api\/products\?category=/);
  assert.match(card, /Impact: changing the props\/export affects \d+ component\(s\)/);
});

test('agents install is idempotent, preserves user content and can be removed', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Team notes\n');
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }] } }));
  installAgents(config);
  const again = installAgents(config);
  assert.ok(again.results.every((r) => r.status === 'unchanged'));
  assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /^# Team notes\n[\s\S]*@\.frontdex\/agent\/RULES\.md/);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.hooks.PostToolUse.length, 2);

  installAgents(config, { remove: true });
  assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), '# Team notes\n');
  assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.PostToolUse[0].hooks[0].command, 'echo mine');
});

test('createTools answers the queries the CLI and frontdex-mcp rely on', () => {
  const { tools } = createTools(loadConfig(tempProject()));
  assert.match(tools.catalogue_impact({ name: 'ProductCard' }), /dependent component/);
  assert.match(tools.catalogue_search({ query: 'is:leaky' }), /HeroBanner[\s\S]*LiveVisitors/);
  assert.match(tools.catalogue_health({ severity: 'high' }), /render-loop · AdminSidebar/);
  assert.match(tools.catalogue_dataflow({ name: 'CartDrawer' }), /reads redux:ui `ui.drawerOpen`/);
  assert.match(tools.catalogue_state({ store: 'redux:cart' }), /written by: .*CartBadge/);
  assert.match(tools.catalogue_find_existing({ name: 'PrimaryButton', props: ['onClick', 'variant'] }), /^Existing components similar[\s\S]*- Button `src\/components\/ui\/Button\.tsx`/);
  assert.match(tools.catalogue_duplicates({ name: 'Button' }), /Button ~ LegacyButton/);
  // Custom hooks resolve through tsconfig aliases (@/features/...) as well as relative imports.
  assert.match(tools.catalogue_hooks({ name: 'useToast' }), /- useToast `src\/features\/toast\/ToastContext\.tsx:\d+` reads ToastContext · used by ProfileForm, .*ToastViewport/);
  assert.match(tools.catalogue_owners({ name: 'Button' }), /CODEOWNERS: @northwind\/design-system[\s\S]*Tests: Button\.test\.tsx · Stories: Button\.stories\.tsx/);
  assert.match(tools.catalogue_adoption({ name: 'Button' }), /\| \d{4}-\d\d-\d\d \| .* \| 1\d \| 1\d \|/);
  assert.match(tools.catalogue_tokens({ query: 'danger' }), /#dc2727 at `src\/features\/products\/ProductCard\.module\.css:7` ≈ --danger/);
});

test('watch session: reported edits, additions and deletions match a cold scan; YAML waits for flush', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  const session = {};
  scan(config, { session });
  const at = (p) => path.join(dir, p);
  const yamlBefore = fs.readFileSync(at(config.output), 'utf8');

  fs.appendFileSync(at('src/components/ui/Badge.tsx'), '\nexport function Pill() { return <span className="pill" />; }\n');
  fs.writeFileSync(at('src/components/ui/Chip.tsx'), 'export function Chip({ label }: { label: string }) { return <b>{label}</b>; }\n');
  fs.rmSync(at('src/components/ui/Spinner.tsx'));
  const warm = scan(config, { session, changed: ['src/components/ui/Badge.tsx', 'src/components/ui/Chip.tsx', 'src/components/ui/Spinner.tsx'].map(at) });

  assert.equal(warm.changed, true);
  assert.ok(warm.catalogue.components.Pill && warm.catalogue.components.Chip);
  assert.equal(warm.catalogue.components.Spinner, undefined);
  assert.equal(fs.readFileSync(at(config.output), 'utf8'), yamlBefore, 'YAML is deferred until flushSession');

  const strip = (c) => ({ ...c, info: { ...c.info, generatedAt: undefined } });
  const cold = scan({ ...config }, { full: true, dryRun: true }).catalogue;
  assert.deepEqual(strip(warm.catalogue), strip(cold));
  // Repeated warm scans reuse the same cache entries; linking must not leave traces in them.
  assert.deepEqual(strip(scan(config, { session, changed: [] }).catalogue), strip(cold));

  assert.equal(flushSession(config, session), true);
  assert.deepEqual(strip(readCatalogue(at(config.output))), strip(cold));
});

test('watch session: a deleted folder falls back to a full walk', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  const session = {};
  scan(config, { session });
  const folder = path.join(dir, 'src/features/toast');
  fs.rmSync(folder, { recursive: true });
  const warm = scan(config, { session, changed: [folder] });
  assert.equal(warm.catalogue.components.ToastViewport, undefined);
  assert.ok(warm.delta.removed.includes('src/features/toast/ToastViewport.tsx'));
});

test('react-catalogue projects keep working and upgrade to frontdex names, agents included', async () => {
  const { upgradeProject } = await import('../src/config.js');
  const dir = tempProject();
  fs.renameSync(path.join(dir, 'frontdex.config.json'), path.join(dir, 'catalogue.config.json'));
  const legacy = loadConfig(dir);
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.output, 'catalogue.yaml');
  scan(legacy);
  assert.ok(fs.existsSync(path.join(dir, 'catalogue.yaml')) && fs.existsSync(path.join(dir, '.catalogue/agent/INDEX.md')));

  // An agent setup written by react-catalogue: its block, MCP server and hooks must be replaced, not duplicated.
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Notes\n\n<!-- react-catalogue:start -->\nold rules\n<!-- react-catalogue:end -->\n');
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { 'react-catalogue': { command: 'npx', args: ['react-catalogue', 'mcp'] }, other: {} } }));

  assert.deepEqual(upgradeProject(dir).map(([, to]) => to).sort(), ['.frontdex', 'frontdex.config.json', 'frontdex.yaml']);
  const config = loadConfig(dir);
  assert.equal(config.legacy, false);
  installAgents(config);
  const agentsMd = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.equal(agentsMd.match(/:start -->/g).length, 1);
  assert.match(agentsMd, /<!-- frontdex:start -->[\s\S]*`\.frontdex\/agent\/`/);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers).sort(), ['frontdex', 'other']);
});

test('subgraph walks a bounded neighbourhood and caps oversized graphs', async () => {
  const { subgraph } = await import('../src/server.js');
  const C = { A: { name: 'A', file: 'src/a/A.tsx', renders: ['B'], usedBy: [] }, B: { name: 'B', file: 'src/a/B.tsx', renders: ['C'], usedBy: ['A'] }, C: { name: 'C', file: 'src/c/C.tsx', renders: [], usedBy: ['B'] } };
  const cat = { components: C, pages: { '/': { component: 'A', layouts: [] } } };

  const near = subgraph(cat, { focus: 'c:A', depth: 1 });
  assert.deepEqual(Object.keys(near.nodes).sort(), ['A', 'B']);
  assert.deepEqual(Object.keys(near.pages), ['/']);
  assert.deepEqual(near.nodes.B.renders, [], 'edges to nodes outside the slice are dropped');

  assert.deepEqual(Object.keys(subgraph(cat, { dir: 'src/c' }).nodes), ['C']);
  const capped = subgraph(cat, { max: 2 });
  assert.equal(capped.truncated, true);
  assert.equal(capped.total, 4);
  assert.equal(subgraph(cat, { max: 2, force: true }).truncated, false);
});

test('watch-session rescans reproduce the cold scan exactly (cached parse records are never mutated)', () => {
  const dir = tempProject();
  const config = { ...loadConfig(dir), history: { enabled: false, limit: 0 }, agents: { enabled: false } };
  const strip = (cat) => JSON.stringify({ ...cat, info: { ...cat.info, generatedAt: undefined } });
  const cold = strip(scan(config, { dryRun: true }).catalogue);
  const session = {};
  scan(config, { session });
  const file = path.join(dir, 'src/features/cart/CartDrawer.tsx');
  for (let i = 0; i < 3; i++) {
    fs.utimesSync(file, new Date(), new Date(Date.now() + i * 1000));
    scan(config, { session, changed: [file] });
  }
  assert.equal(strip(session.catalogue), cold);
});
