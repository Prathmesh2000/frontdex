import { createHashHistory, createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Same look as the classic UI: the stylesheet is shared, not duplicated.
import '../../ui/styles.css';
import { api, appUrl } from './api';
import { GraphView } from './graph';
import { SourceContext, SourcePanel, useApi } from './lib';
import { Palette } from './palette';
import { Changes } from './changes';
import { Docs } from './docs';
import { ComponentView, Components, Design, Folders, Health, History, Hooks, Overview, PageView, Pages, State } from './views';
import { Tests } from './tests';

// The previous UI sits beside this one, wherever the app is mounted.
const CLASSIC = appUrl('classic/');

const NAV: [string, string][] = [
  ['/', 'Overview'],
  ['/pages', 'Site map'],
  ['/components', 'Components'],
  ['/folders', 'Folders'],
  ['/state', 'State'],
  ['/health', 'Health'],
  ['/design', 'Design'],
  ['/hooks', 'Hooks'],
  ['/docs', 'Docs'],
  ['/tests', 'Tests'],
  ['/changes', 'Changes'],
  ['/graph', 'Graph'],
  ['/history', 'History'],
];

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function Shell() {
  // `frontdex serve --watch` pushes "reload" after each rescan; remounting the view refetches its data in place.
  const [version, setVersion] = useState(0);
  const [source, setSource] = useState<{ file: string; line?: number }>();
  const { data: info } = useApi(api.info, [version]);
  useEffect(() => {
    const events = new EventSource(appUrl('api/events'));
    events.onmessage = () => setVersion((v) => v + 1);
    return () => events.close();
  }, []);
  const openSource = useCallback((file: string, line?: number) => setSource({ file, line }), []);
  return (
    <SourceContext.Provider value={openSource}>
      <header className="top">
        <Link to="/" className="brand">
          <span id="title">frontdex</span>
        </Link>
        <nav className="top-nav">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} activeOptions={{ exact: to === '/', includeSearch: false }} activeProps={{ className: 'active' }}>
              <span className="lbl">{label}</span>
            </Link>
          ))}
        </nav>
        {info?.settling && (
          <span className="badge" title="Components are current; duplicates, tokens, pages and dead code update once edits pause">
            analysing…
          </span>
        )}
        {/* The palette listens for Ctrl+K itself; the button just sends it that shortcut. */}
        <button className="search-trigger" style={{ marginLeft: 'auto' }} onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <span className="st-text">Search…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <a className="btn btn-sm" href={CLASSIC} title="The previous UI">
          Classic
        </a>
      </header>
      <main id="main" key={version} style={{ padding: '24px 32px' }}>
        <Outlet />
      </main>
      {source && <SourcePanel {...source} root={info?.root} onClose={() => setSource(undefined)} />}
      <Palette />
    </SourceContext.Provider>
  );
}

const root = createRootRoute({ component: Shell });
const route = <P extends string>(path: P) => ({ getParentRoute: () => root, path });

const componentsRoute = createRoute({
  ...route('/components'),
  validateSearch: (s: Record<string, unknown>) => ({ q: str(s.q) ?? '' }),
  component: () => <Components q={componentsRoute.useSearch().q} />,
});
const componentRoute = createRoute({ ...route('/c/$id'), component: () => <ComponentView id={componentRoute.useParams().id} /> });
// Routes contain slashes, so a page is addressed by search param rather than a path segment.
const pageRoute = createRoute({
  ...route('/page'),
  validateSearch: (s: Record<string, unknown>) => ({ route: str(s.route) ?? '/' }),
  component: () => <PageView route={pageRoute.useSearch().route} />,
});
const healthRoute = createRoute({
  ...route('/health'),
  validateSearch: (s: Record<string, unknown>) => ({ severity: str(s.severity) }),
  component: () => <Health severity={healthRoute.useSearch().severity} />,
});
const changesRoute = createRoute({
  ...route('/changes'),
  validateSearch: (s: Record<string, unknown>) => ({ base: str(s.base) ?? 'HEAD', head: str(s.head) }),
  component: () => {
    const { base, head } = changesRoute.useSearch();
    return <Changes base={base} head={head} />;
  },
});
const graphRoute = createRoute({
  ...route('/graph'),
  validateSearch: (s: Record<string, unknown>) => ({ focus: str(s.focus), depth: Number(s.depth) || 2, dir: str(s.dir) }),
  component: () => {
    const { focus, depth, dir } = graphRoute.useSearch();
    return <GraphView focus={focus} depth={depth} dir={dir} />;
  },
});

const foldersRoute = createRoute({
  ...route('/folders'),
  validateSearch: (s: Record<string, unknown>) => ({ path: str(s.path) ?? '' }),
  component: () => <Folders path={foldersRoute.useSearch().path} />,
});

const routeTree = root.addChildren([
  foldersRoute,
  createRoute({ ...route('/'), component: Overview }),
  createRoute({ ...route('/pages'), component: Pages }),
  componentsRoute,
  componentRoute,
  pageRoute,
  createRoute({ ...route('/state'), component: State }),
  healthRoute,
  createRoute({ ...route('/design'), component: Design }),
  createRoute({ ...route('/hooks'), component: Hooks }),
  createRoute({ ...route('/docs'), component: Docs }),
  createRoute({ ...route('/tests'), component: Tests }),
  changesRoute,
  graphRoute,
  createRoute({ ...route('/history'), component: History }),
]);

// Hash history: the UI is static files served under /v2/, so the server never needs to know the routes.
const router = createRouter({ routeTree, history: createHashHistory() });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
