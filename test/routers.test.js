import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scanProject, validateCatalogue } from '../src/index.js';

/** Writes a throwaway project ({ 'path': 'content' }) and scans it. */
function scanFixture(deps, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routers-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: deps }));
  for (const [rel, code] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), code);
  }
  const cat = scanProject(loadConfig(dir)).catalogue;
  assert.deepEqual(validateCatalogue(cat), { valid: true, errors: [] });
  return cat;
}

const page = (name, body = `<main>${name}</main>`) => `export default function ${name}() { return ${body}; }\n`;
const layout = (name) => `import { Outlet } from 'react-router';\nexport default function ${name}() { return <div><Outlet /></div>; }\n`;
const summary = (cat) => Object.fromEntries(Object.entries(cat.pages).map(([r, p]) => [r, [p.router, p.component, ...(p.layouts ?? [])].join(' ')]));

test('Remix v2 flat routes: index, params, pathless and nested layouts, folders, resource routes', () => {
  const cat = scanFixture({ '@remix-run/react': '2' }, {
    'app/root.tsx': layout('Root'),
    'app/routes/_index.tsx': page('Home'),
    'app/routes/about.tsx': page('About'),
    'app/routes/dashboard.tsx': layout('Dashboard'),
    'app/routes/dashboard._index.tsx': page('DashboardHome'),
    'app/routes/dashboard.$projectId.tsx': page('Project'),
    'app/routes/dashboard_.print.tsx': page('PrintDashboard'),
    'app/routes/_auth.tsx': layout('AuthShell'),
    'app/routes/_auth.login.tsx': page('Login'),
    'app/routes/files.$.tsx': page('Files'),
    'app/routes/($lang).pricing.tsx': page('Pricing'),
    'app/routes/settings/route.tsx': page('Settings'),
    'app/routes/settings/helpers.ts': 'export const x = 1;\n',
    'app/routes/api.health.ts': 'export function loader() { return new Response("ok"); }\n',
  });
  assert.deepEqual(summary(cat), {
    '/': 'remix Home Root',
    '/about': 'remix About Root',
    '/dashboard': 'remix DashboardHome Root Dashboard',
    '/dashboard/:projectId': 'remix Project Root Dashboard',
    '/dashboard/print': 'remix PrintDashboard Root',
    '/login': 'remix Login Root AuthShell',
    '/files/*': 'remix Files Root',
    '/:lang?/pricing': 'remix Pricing Root',
    '/settings': 'remix Settings Root',
  });
  assert.deepEqual(cat.pages['/dashboard/:projectId'].params, ['projectId']);
  // A route module with a loader and no component is a resource route.
  assert.deepEqual(cat.endpoints['/api/health'], { kind: 'resource-route', file: 'app/routes/api.health.ts', methods: ['GET'] });
});

test('React Router v7 framework mode: app/routes.ts config with layout, prefix, nested and flatRoutes()', () => {
  const cat = scanFixture({ '@react-router/dev': '7', 'react-router': '7' }, {
    'app/root.tsx': layout('Root'),
    'app/routes.ts': [
      "import { type RouteConfig, route, index, layout, prefix } from '@react-router/dev/routes';",
      "import { flatRoutes } from '@react-router/fs-routes';",
      'export default [',
      "  index('./home.tsx'),",
      "  route('about', './about.tsx'),",
      "  layout('./auth/layout.tsx', [route('login', './auth/login.tsx')]),",
      "  ...prefix('concerts', [index('./concerts/home.tsx'), route(':city', './concerts/city.tsx')]),",
      "  route('teams/:teamId', './team.tsx', [index('./team-home.tsx')]),",
      '  ...(await flatRoutes()),',
      '] satisfies RouteConfig;',
    ].join('\n'),
    'app/home.tsx': page('Home'),
    'app/about.tsx': page('About'),
    'app/auth/layout.tsx': layout('AuthLayout'),
    'app/auth/login.tsx': page('Login'),
    'app/concerts/home.tsx': page('ConcertsHome'),
    'app/concerts/city.tsx': page('City'),
    'app/team.tsx': layout('Team'),
    'app/team-home.tsx': page('TeamHome'),
    'app/routes/blog.$slug.tsx': page('BlogPost'),
  });
  assert.deepEqual(summary(cat), {
    '/': 'react-router-v7 Home Root',
    '/about': 'react-router-v7 About Root',
    '/login': 'react-router-v7 Login Root AuthLayout',
    '/concerts': 'react-router-v7 ConcertsHome Root',
    '/concerts/:city': 'react-router-v7 City Root',
    '/teams/:teamId': 'react-router-v7 TeamHome Root Team',
    '/blog/:slug': 'react-router-v7 BlogPost Root',
  });
});

test('TanStack Router: createFileRoute paths, root layout, parent routes, pathless layouts and index routes', () => {
  const route = (p, name, body = `<main>${name}</main>`) => `import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute('${p}')({ component: ${name} });\nfunction ${name}() { return ${body}; }\n`;
  const cat = scanFixture({ '@tanstack/react-router': '1' }, {
    'src/routes/__root.tsx': "import { createRootRoute, Outlet } from '@tanstack/react-router';\nexport const Route = createRootRoute({ component: RootComponent });\nfunction RootComponent() { return <div><Outlet /></div>; }\n",
    'src/routes/index.tsx': route('/', 'Home'),
    'src/routes/posts.tsx': route('/posts', 'PostsLayout', '<section><Outlet /></section>'),
    'src/routes/posts.index.tsx': route('/posts/', 'PostsIndex'),
    'src/routes/posts.$postId.tsx': route('/posts/$postId', 'Post'),
    'src/routes/_auth.tsx': route('/_auth', 'AuthLayout', '<div><Outlet /></div>'),
    'src/routes/_auth/profile.tsx': route('/_auth/profile', 'Profile'),
    // No path argument: derived from the file name.
    'src/routes/about.tsx': "import { createFileRoute } from '@tanstack/react-router';\nexport const Route = createFileRoute()({ component: About });\nfunction About() { return <p />; }\n",
  });
  assert.deepEqual(summary(cat), {
    '/': 'tanstack Home RootComponent',
    '/posts': 'tanstack PostsIndex RootComponent PostsLayout',
    '/posts/$postId': 'tanstack Post RootComponent PostsLayout',
    '/profile': 'tanstack Profile RootComponent AuthLayout',
    '/about': 'tanstack About RootComponent',
  });
  assert.deepEqual(cat.pages['/posts/$postId'].params, ['postId']);
});

test('Gatsby, SolidStart and Qwik City file routes', () => {
  const gatsby = scanFixture({ gatsby: '5' }, {
    'src/pages/index.tsx': page('Home'),
    'src/pages/blog/{MarkdownRemark.slug}.tsx': page('BlogPost'),
    'src/pages/app/[...].tsx': page('ClientApp'),
    'src/pages/_partial.tsx': page('Partial'),
  });
  assert.deepEqual(summary(gatsby), { '/': 'gatsby Home', '/app/[...]': 'gatsby ClientApp', '/blog/{MarkdownRemark.slug}': 'gatsby BlogPost' });
  assert.deepEqual(gatsby.pages['/blog/{MarkdownRemark.slug}'].params, ['slug']);

  const solid = scanFixture({ '@solidjs/start': '1', 'solid-js': '1' }, {
    'src/app.tsx': page('App', '<div>{props.children}</div>'),
    'src/routes/index.tsx': page('Home'),
    'src/routes/users.tsx': page('UsersLayout', '<div>{props.children}</div>'),
    'src/routes/users/index.tsx': page('UsersList'),
    'src/routes/users/[id].tsx': "import { createSignal } from 'solid-js';\nexport default function User() { const [tab, setTab] = createSignal('profile'); return <main>{tab()}</main>; }\n",
    'src/routes/(marketing)/pricing.tsx': page('Pricing'),
  });
  assert.deepEqual(solid.components.User.state.tab, { source: 'signal', initial: "'profile'", setter: 'setTab' });
  assert.deepEqual(summary(solid), {
    '/pricing': 'solid-start Pricing App',
    '/': 'solid-start Home App',
    '/users/[id]': 'solid-start User App UsersLayout',
    '/users': 'solid-start UsersList App UsersLayout',
  });

  const component = (name) => `import { component$ } from '@builder.io/qwik';\nexport default component$(() => <main>${name}</main>);\n`;
  const qwik = scanFixture({ '@builder.io/qwik-city': '1', '@builder.io/qwik': '1' }, {
    'src/routes/layout.tsx': `import { component$, Slot } from '@builder.io/qwik';\nexport default component$(() => <div><Slot /></div>);\n`,
    'src/routes/index.tsx': component('Home'),
    'src/routes/products/[id]/index.tsx': component('Product'),
    'src/routes/(shop)/cart/index.tsx': component('Cart'),
  });
  assert.deepEqual(Object.keys(qwik.pages).sort(), ['/', '/cart', '/products/[id]']);
  assert.equal(qwik.pages['/products/[id]'].layouts.length, 1);
  assert.ok(qwik.pages['/'].component);
});

test('React Router: constant paths, conditional and wrapped elements, nested <Routes>, stale route files', () => {
  const cat = scanFixture({ react: '18', 'react-router-dom': '6' }, {
    'src/index.jsx': "import App from './App';\nexport default App;\n",
    'src/routes.js': "const ROUTES = { HOME: '/home', LOGIN: '/login', ADMIN: '/admin' };\nexport default ROUTES;\n",
    'src/App.jsx': [
      "import { Routes, Route } from 'react-router-dom';",
      "import ROUTES from './routes';",
      "import { Home, Login, Spinner, RequireAuth, Admin } from './pages';",
      'const routes = [',
      '  { path: ROUTES.LOGIN, element: loading ? <Spinner /> : <Login /> },',
      '  { path: `${ROUTES.ADMIN}/settings`, element: <RequireAuth><Admin /></RequireAuth> },',
      '];',
      'export default function App({ loading }) {',
      '  return <Routes>{routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}<Route path={`${ROUTES.HOME}/*`} element={<Home />} /></Routes>;',
      '}',
    ].join('\n'),
    'src/pages.jsx': [
      "import { Routes, Route } from 'react-router-dom';",
      "import ROUTES from './routes';",
      'export const Spinner = () => <i />;',
      'export const Login = () => <form />;',
      'export const Admin = () => <main />;',
      'export const RequireAuth = ({ children }) => <>{children}</>;',
      'export const Profile = () => <section />;',
      'export const Home = () => <Routes><Route path={ROUTES.HOME.slice(1) + "/profile"} element={<Profile />} /></Routes>;',
    ].join('\n'),
    // Leftover: nothing reachable from src/index.jsx imports it.
    'old/App.jsx': "import { Route } from 'react-router-dom';\nconst Old = () => <p />;\nexport const routes = <Route path=\"/legacy\" element={<Old />} />;\n",
  });
  assert.equal(cat.pages['/login'].component, 'Login');
  assert.deepEqual(cat.pages['/login'].alternates, ['Spinner']);
  assert.equal(cat.pages['/admin/settings'].component, 'Admin');
  assert.deepEqual(cat.pages['/admin/settings'].wrappers, ['RequireAuth']);
  assert.equal(cat.pages['/home/home/profile'].component, 'Profile', 'nested <Routes> hang under the /home/* route that renders them');
  assert.equal(cat.pages['/legacy'], undefined, 'routes in files the app never loads are dropped');
});
