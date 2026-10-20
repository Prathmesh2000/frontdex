import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scanProject, validateCatalogue } from '../src/index.js';

/** Writes a throwaway React Router project ({ 'path': 'content' }) and scans it. */
function scanFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { react: '18', 'react-router-dom': '6' } }));
  for (const [rel, code] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), code);
  }
  const cat = scanProject(loadConfig(dir)).catalogue;
  assert.deepEqual(validateCatalogue(cat), { valid: true, errors: [] });
  return cat;
}

const files = {
  'src/index.jsx': "import App from './App';\nexport default App;\n",
  'src/routes.js': "export const ROUTES = { USERS: '/users', USER: '/users/:id', SETTINGS: '/settings' };\n",
  'src/App.jsx': [
    "import { Routes, Route } from 'react-router-dom';",
    "import { ROUTES } from './routes';",
    "import { Users, User, Settings } from './pages';",
    'export default function App() {',
    '  return <Routes><Route path={ROUTES.USERS} element={<Users />} /><Route path={ROUTES.USER} element={<User />} /><Route path={ROUTES.SETTINGS} element={<Settings />} /></Routes>;',
    '}',
  ].join('\n'),
  'src/blocks.jsx': [
    "import { CodeBlock, Note } from './parts';",
    '// A block registry: JSX outside any component.',
    'export const blockRegistry = { code: (p) => <CodeBlock code={p.code} />, note: () => <Note /> };',
  ].join('\n'),
  'src/parts.jsx': [
    'export const CodeBlock = ({ code }) => <pre>{code}</pre>;',
    'export const Note = () => <aside />;',
    'export const Spinner = () => <i />;',
    'export const Empty = () => <p>none</p>;',
    'export const Row = ({ user }) => <li>{user.name}</li>;',
    'export const RoleTable = () => <table />;',
    'export const AuditLog = () => <ol />;',
    'export const StatusChip = ({ row }) => <b>{row.status}</b>;',
    'export const Grid = ({ columns }) => <div>{columns.length}</div>;',
    'export const ExportButton = () => <button>Export</button>;',
    // Looks like a component, but is called as a function and returns config.
    'export const UserColumns = () => [{ field: "status", renderCell: (r) => <StatusChip row={r} /> }];',
  ].join('\n'),
  'src/pages.jsx': [
    "import { useState } from 'react';",
    "import { Link, useNavigate } from 'react-router-dom';",
    "import { ROUTES } from './routes';",
    "import { blockRegistry } from './blocks';",
    "import { Spinner, Empty, Row, RoleTable, AuditLog, Grid, UserColumns, ExportButton } from './parts';",
    'export function Users({ loading, users, admin }) {',
    '  const navigate = useNavigate();',
    '  if (loading) return <Spinner />;',
    '  return <main>',
    '    {users.length ? users.map((u) => <Row key={u.id} user={u} onClick={() => navigate(`/users/${u.id}`)} />) : <Empty />}',
    '    {admin && <ExportButton />}',
    '    <Grid columns={UserColumns()} />',
    '    <Link to={ROUTES.SETTINGS}>settings</Link>',
    '  </main>;',
    '}',
    'export function User() { return <div>{blockRegistry.code({ code: "x" })}</div>; }',
    'export function Settings() {',
    "  const [tab, setTab] = useState('roles');",
    "  return <section>{tab === 'roles' && <RoleTable />}{tab === 'audit' && <AuditLog />}</section>;",
    '}',
  ].join('\n'),
};

test('conditional children keep the conditions they render under', () => {
  const { components: c } = scanFixture(files);
  assert.deepEqual(c.Users.rendersWhen.Spinner, ['loading']);
  assert.deepEqual(c.Users.rendersWhen.Row, ['!loading && users.length && each of users']);
  assert.deepEqual(c.Users.rendersWhen.Empty, ['!loading && !users.length']);
  assert.deepEqual(c.Users.rendersWhen.ExportButton, ['!loading && admin']);
  assert.deepEqual(c.Users.rendersWhen.Grid, ['!loading'], 'everything after an early return is guarded by it');
  assert.equal(c.Settings.rendersWhen?.Grid, undefined);
});

test('tabs switched by state are reported as views', () => {
  const { components: c } = scanFixture(files);
  assert.deepEqual(c.Settings.views, [{ on: 'tab', cases: { "'roles'": ['RoleTable'], "'audit'": ['AuditLog'] } }]);
});

test('registries, column configs and helper calls credit the components they render', () => {
  const { components: c, pages } = scanFixture(files);
  assert.ok(c.User.renders.includes('CodeBlock') && c.User.renders.includes('Note'), 'block registry');
  assert.deepEqual(c.User.rendersWhen.CodeBlock, ['via blockRegistry']);
  assert.ok(c.Users.renders.includes('UserColumns'), 'helper called as a function');
  assert.ok(c.UserColumns.renders.includes('StatusChip'), 'renderCell inside the helper');
  assert.ok(c.StatusChip.pages?.includes('/users'), 'reaches the page through the chain');
  assert.ok(pages['/users/:id'].components.includes('CodeBlock'));
});

test('navigation is resolved to pages: constants, templates with params', () => {
  const { components: c, pages } = scanFixture(files);
  assert.deepEqual(c.Users.navigatesTo, ['/settings', '/users/:id']);
  assert.deepEqual(pages['/users'].linksTo, ['/settings', '/users/:id']);
});
