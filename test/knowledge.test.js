import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { installAgents } from '../src/agents.js';
import { createHistory, knowledgeDir, loadConfig, scan } from '../src/index.js';
import { startMcpServer } from '../src/mcp.js';

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcat-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/next-app'), dir, { recursive: true, filter: (src) => !src.includes('.catalogue') && !src.endsWith('catalogue.yaml') });
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
  const agent = path.join(dir, '.catalogue/agent');
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
  assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /^# Team notes\n[\s\S]*@\.catalogue\/agent\/RULES\.md/);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.hooks.PostToolUse.length, 2);

  installAgents(config, { remove: true });
  assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), '# Team notes\n');
  assert.equal(fs.existsSync(path.join(dir, 'AGENTS.md')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.PostToolUse[0].hooks[0].command, 'echo mine');
});

test('MCP server answers legacy and stateless clients', async () => {
  const dir = tempProject();
  const input = new PassThrough();
  const output = new PassThrough();
  let buf = '';
  output.on('data', (d) => (buf += d));
  const done = startMcpServer(loadConfig(dir), { input, output });
  const modern = { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } };
  for (const msg of [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'catalogue_impact', arguments: { name: 'ProductCard' } } },
    { jsonrpc: '2.0', id: 3, method: 'server/discover', params: modern },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'catalogue_search', arguments: { query: 'is:leaky' }, ...modern } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'catalogue_health', arguments: { severity: 'high' } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'catalogue_dataflow', arguments: { name: 'CartDrawer' } } },
    { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'catalogue_state', arguments: { store: 'redux:cart' } } },
  ]) input.write(JSON.stringify(msg) + '\n');
  input.end();
  await done;
  const replies = buf.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(replies[0].result.protocolVersion, '2025-11-25');
  assert.match(replies[1].result.content[0].text, /dependent component/);
  assert.ok(replies[2].result.supportedVersions.includes('2026-07-28'));
  assert.equal(replies[3].result.resultType, 'complete');
  assert.match(replies[3].result.content[0].text, /HeroBanner[\s\S]*LiveVisitors/);
  assert.match(replies[4].result.content[0].text, /render-loop · AdminSidebar/);
  assert.match(replies[5].result.content[0].text, /reads redux:ui `ui.drawerOpen`/);
  assert.match(replies[6].result.content[0].text, /written by: .*CartBadge/);
});
