import { createHashHistory, createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Same look as the classic UI: the stylesheet is shared, not duplicated.
import '../../ui/styles.css';
import { ComponentView, Components, Design, Health, Hooks, Overview } from './views';

const NAV: [string, string][] = [
  ['/', 'Overview'],
  ['/components', 'Components'],
  ['/health', 'Health'],
  ['/design', 'Design'],
  ['/hooks', 'Hooks'],
];

const root = createRootRoute({
  component: () => (
    <>
      <header className="top">
        <a href="../" className="brand" title="Classic UI">
          <span id="title">frontdex</span>
        </a>
        <nav className="top-nav">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} activeOptions={{ exact: to === '/' }} activeProps={{ className: 'active' }}>
              <span className="lbl">{label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" style={{ padding: '24px 32px' }}>
        <Outlet />
      </main>
    </>
  ),
});

const routes = [
  createRoute({ getParentRoute: () => root, path: '/', component: Overview }),
  createRoute({
    getParentRoute: () => root,
    path: '/components',
    validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === 'string' ? s.q : '' }),
    component: function ComponentsRoute() {
      const { q } = componentsRoute.useSearch();
      return <Components q={q} />;
    },
  }),
  createRoute({
    getParentRoute: () => root,
    path: '/c/$id',
    component: function ComponentRoute() {
      const { id } = componentRoute.useParams();
      return <ComponentView id={id} />;
    },
  }),
  createRoute({
    getParentRoute: () => root,
    path: '/health',
    validateSearch: (s: Record<string, unknown>) => ({ severity: typeof s.severity === 'string' ? s.severity : undefined }),
    component: function HealthRoute() {
      const { severity } = healthRoute.useSearch();
      return <Health severity={severity} />;
    },
  }),
  createRoute({ getParentRoute: () => root, path: '/design', component: Design }),
  createRoute({ getParentRoute: () => root, path: '/hooks', component: Hooks }),
];
const [, componentsRoute, componentRoute, healthRoute] = routes;

// Hash history: the UI is static files served under /v2/, so the server never needs to know the routes.
const router = createRouter({ routeTree: root.addChildren(routes), history: createHashHistory() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
