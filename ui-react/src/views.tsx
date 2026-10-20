import { Link, useNavigate } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { api, appUrl, type Component, type ComponentRow, type Issue } from './api';
import { Card, CompLink, FileRef, Header, Issues, Loading, PageLink, Swatch, useApi } from './lib';

const PAGE = 100;

export function Overview() {
  const { data, error } = useApi(api.info, []);
  if (!data) return <Loading error={error} />;
  const { info, counts, issues } = data;
  const stat = (n: number | undefined, label: string, to?: string) => {
    const body = (
      <div>
        <div className="v">{n ?? 0}</div>
        <div className="k">{label}</div>
      </div>
    );
    return to ? <Link className="stat" to={to}>{body}</Link> : <div className="stat">{body}</div>;
  };
  return (
    <>
      <Header title={info.title} sub={[info.version && `v${info.version}`, info.framework, info.routers?.join(', '), info.packageManager, info.workspaces?.length && `${info.workspaces.length} workspaces`].filter(Boolean).join(' · ')} />
      <div className="stats">
        {stat(counts.components, 'components', '/components')}
        {stat(counts.pages, 'pages', '/pages')}
        {stat(counts.stores, 'global stores', '/state')}
        {stat(counts.hooks, 'custom hooks', '/hooks')}
        {stat(counts.tokens, 'design tokens', '/design')}
        {stat(issues.high, 'high-severity issues', '/health')}
        {stat(counts.duplicates, 'possible duplicates', '/design')}
      </div>
    </>
  );
}

/** Components, searched with the query language and paged from the server; the list is virtualized. */
export function Components({ q }: { q: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ComponentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string>();
  const loading = useRef(false);
  const parent = useRef<HTMLDivElement>(null);

  const load = async (offset: number) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const page = await api.components({ q, offset, limit: PAGE });
      setTotal(page.total);
      setRows((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      loading.current = false;
    }
  };
  useEffect(() => {
    setRows([]);
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the query changes
  }, [q]);

  const virtual = useVirtualizer({ count: total, getScrollElement: () => parent.current, estimateSize: () => 44, overscan: 12 });
  const items = virtual.getVirtualItems();
  // Fetch the next page when the user scrolls near the end of what is loaded.
  useEffect(() => {
    const last = items.at(-1);
    if (last && last.index >= rows.length - 20 && rows.length < total) void load(rows.length);
  });

  return (
    <>
      <Header title="Components" sub={`${total} match${total === 1 ? '' : 'es'}. Filters: uses:Button is:shared hook:useQuery prop:onClose issue:a11y-img-alt kind:styled …`} />
      <div className="toolbar" style={{ position: 'static' }}>
        <input defaultValue={q} placeholder="Search or filter…" onKeyDown={(e) => e.key === 'Enter' && navigate({ to: '/components', search: { q: e.currentTarget.value } })} />
      </div>
      {error && <Loading error={error} />}
      <div ref={parent} className="card wide" style={{ height: 'calc(100vh - 260px)', overflow: 'auto' }}>
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {items.map((v) => {
            const r = rows[v.index];
            return (
              <div key={v.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)`, display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 8px' }}>
                {r ? (
                  <>
                    <CompLink id={r.id} />
                    <span className="badge">{r.kind}</span>
                    <FileRef at={`${r.file}${r.line ? `:${r.line}` : ''}`} />
                    <span className="muted small" style={{ marginLeft: 'auto' }}>
                      used by {r.usedBy} · {r.pages} pages{r.issues ? ` · ${r.issues} issues` : ''}
                    </span>
                  </>
                ) : (
                  <span className="muted small">…</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Story args are kept as source text ('"primary"', '{ a: 1 }'); JSON-shaped ones become values, the rest stay strings.
const argsToJson = (args: Record<string, string> = {}) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(args).map(([k, v]) => {
        try {
          return [k, JSON.parse(v)];
        } catch {
          return [k, v];
        }
      }),
    ),
    null,
    2,
  );

/** The component rendered by the app's own Vite dev server, with a JSON props editor seeded from its first story. */
function LivePreview({ path, c }: { path: string; c: Component }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [text, setText] = useState(() => argsToJson(c.examples?.[0]?.args));
  const [error, setError] = useState<string>();
  const src = appUrl(`${path}?id=${encodeURIComponent(c.id)}`);
  const apply = (from = text) => {
    try {
      const props = JSON.parse(from);
      setError(undefined);
      frame.current?.contentWindow?.postMessage({ type: 'frontdex:props', props }, location.origin);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  // The preview asks for its props once it has loaded the component (props never travel in its URL).
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    const onMessage = (e: MessageEvent) => e.source === frame.current?.contentWindow && e.data?.type === 'frontdex:ready' && apply(textRef.current);
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads the latest text through the ref
  }, []);
  return (
    <Card title="Live preview" sub="Rendered by your Vite dev server with the props on the right (JSON).">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 12 }}>
        <iframe ref={frame} src={src} title={`${c.name} preview`} style={{ width: '100%', height: 360, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{ width: '100%', height: 300, fontFamily: 'var(--mono)', fontSize: 12 }} />
          <button className="btn" onClick={() => apply()}>
            Apply props
          </button>
          {error && <p className="none">Not valid JSON: {error}</p>}
        </div>
      </div>
    </Card>
  );
}

export function ComponentView({ id }: { id: string }) {
  const { data: c, error } = useApi(() => api.component(id), [id]);
  const { data: info } = useApi(api.info, []);
  if (!c) return <Loading error={error} />;
  const props = Object.entries(c.props ?? {});
  return (
    <>
      <Header
        title={c.name}
        badges={
          <>
            <span className="badge">{c.kind}</span>
            {c.rendering && <span className="badge">{c.rendering}</span>}
            {c.tag && <span className="badge mono">&lt;{c.tag}&gt;</span>}
            {c.status && <span className={`badge${c.status === 'deprecated' ? ' danger' : ''}`}>{c.status}</span>}
          </>
        }
        sub={
          <>
            <FileRef at={`${c.file}${c.line ? `:${c.line}` : ''}`} /> {c.codeowners && <span>CODEOWNERS {c.codeowners.join(', ')}</span>} {c.tests && <span>tested ({c.tests.join(', ')})</span>}
          </>
        }
      />
      {c.description && <p className="desc">{c.description}</p>}
      {info?.livePreview && <LivePreview key={c.id} path={info.livePreview} c={c} />}
      <div className="grid">
        <Card title="Props" count={props.length} wide={false}>
          {props.length ? (
            <table>
              <tbody>
                {props.map(([k, p]) => (
                  <tr key={k}>
                    <td>
                      <code>
                        {k}
                        {p.required ? '' : '?'}
                      </code>
                    </td>
                    <td className="small mono">{p.type}</td>
                    <td className="small mono">{p.default ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="none">No props.</p>
          )}
        </Card>
        <Card title="Used by" count={c.usedBy?.length ?? 0} wide={false}>
          <div className="chips">{c.usedBy?.map((x) => <CompLink key={x} id={x} />) ?? <p className="none">Nothing renders it.</p>}</div>
        </Card>
        <Card title="Renders" count={c.renders?.length ?? 0} wide={false} sub={c.rendersWhen ? 'Children shown only under a condition list it below their name.' : undefined}>
          {c.renders?.length ? (
            <table>
              <tbody>
                {c.renders.map((x) => (
                  <tr key={x}>
                    <td>
                      <CompLink id={x} />
                    </td>
                    <td className="small mono">{c.rendersWhen?.[x]?.join(' | ') ?? <span className="muted">always</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="none">No child components.</p>
          )}
        </Card>
        <Card title="Pages" count={c.pages?.length ?? 0} wide={false}>
          <div className="chips">{c.pages?.map((p) => <PageLink key={p} route={p} />) ?? <p className="none">Not on any page.</p>}</div>
        </Card>
        {c.navigatesTo?.length ? (
          <Card title="Navigates to" count={c.navigatesTo.length} wide={false} sub="Links, redirects and navigate() calls in this component.">
            <div className="chips">{c.navigatesTo.map((p) => <PageLink key={p} route={p} />)}</div>
          </Card>
        ) : null}
      </div>
      {c.views?.length ? (
        <Card title="Views" count={c.views.length} sub="Screens this component switches between by state instead of routes (tabs, steps, popups).">
          {c.views.map((v) => (
            <table key={v.on} style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th colSpan={2}>
                    by <code>{v.on}</code>
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(v.cases).map(([value, ids]) => (
                  <tr key={value}>
                    <td className="mono small">{value}</td>
                    <td>
                      <div className="chips">{ids.map((id) => <CompLink key={id} id={id} />)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </Card>
      ) : null}
      {c.examples?.length ? (
        <Card title="Usage examples (stories)" count={c.examples.length}>
          {c.examples.map((e) => (
            <div key={e.story}>
              <code>
                &lt;{c.name}
                {Object.entries(e.args ?? {}).map(([k, v]) => (v.startsWith('"') ? ` ${k}=${v}` : ` ${k}={${v}}`))} /&gt;
              </code>{' '}
              <span className="muted small">{e.story}</span>
            </div>
          ))}
        </Card>
      ) : null}
      <Card title="Issues" count={c.issues?.length ?? 0}>
        <Issues items={c.issues ?? []} />
      </Card>
    </>
  );
}

export function Health({ severity }: { severity?: string }) {
  const [items, setItems] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const { data: info } = useApi(api.info, []);
  useEffect(() => {
    setItems([]);
    api.issues({ severity, limit: PAGE }).then((p) => {
      setItems(p.items);
      setTotal(p.total);
    });
  }, [severity]);
  const more = () => api.issues({ severity, offset: items.length, limit: PAGE }).then((p) => setItems((prev) => [...prev, ...p.items]));
  return (
    <>
      <Header title="Health" sub="Leaks, render loops, accessibility, i18n, heavy imports, token drift, duplicates and dead code." />
      <div className="toolbar" style={{ position: 'static' }}>
        <Link className={`fchip${!severity ? ' on' : ''}`} to="/health" search={{}}>
          All
        </Link>
        {(['high', 'medium', 'low', 'info'] as const).map((s) => (
          <Link key={s} className={`fchip${severity === s ? ' on' : ''}`} to="/health" search={{ severity: s }}>
            {s} <span className="muted">{info?.issues[s] ?? 0}</span>
          </Link>
        ))}
      </div>
      <Card title="Issues" count={total}>
        <Issues items={items} />
        {items.length < total && (
          <button className="btn" onClick={more}>
            Show more ({total - items.length} left)
          </button>
        )}
      </Card>
    </>
  );
}

export function Design() {
  const tokens = useApi(api.tokens, []);
  const dupes = useApi(api.duplicates, []);
  if (tokens.loading || dupes.loading) return <Loading error={tokens.error ?? dupes.error} />;
  const defs = Object.entries(tokens.data?.definitions ?? {});
  const drift = tokens.data?.drift ?? [];
  return (
    <>
      <Header title="Design system" sub="Tokens, the hard-coded values that drift from them, and components that look like duplicates." />
      <Card title="Design tokens" count={defs.length}>
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Value</th>
              <th>Source</th>
              <th>Defined</th>
              <th>Uses</th>
              <th>Used by</th>
            </tr>
          </thead>
          <tbody>
            {defs.map(([k, t]) => (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td>
                  <Swatch value={t.value} />
                  <code>{t.value}</code>
                </td>
                <td>
                  <span className="badge">{t.source ?? 'css'}</span>
                </td>
                <td>
                  <FileRef at={t.at} />
                </td>
                <td>{t.uses ?? '–'}</td>
                <td>{t.usedBy?.map((id) => <CompLink key={id} id={id} />) ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Hard-coded values that should use a token" count={drift.length}>
        <table>
          <tbody>
            {drift.map((d, n) => (
              <tr key={n}>
                <td>
                  <Swatch value={d.value} />
                  <code>{d.value}</code>
                </td>
                <td>
                  <FileRef at={d.at} />
                </td>
                <td>
                  <span className={`badge${d.match === 'near' ? ' sev-low' : ''}`}>{d.match}</span> <code>{d.token}</code>
                </td>
                <td>
                  use <code>{d.use}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Possible duplicates" count={dupes.data?.length ?? 0}>
        {(dupes.data ?? []).map((d) => (
          <div key={d.components.join('~')} className="chips" style={{ marginBottom: 8 }}>
            <CompLink id={d.components[0]} /> ~ <CompLink id={d.components[1]} />
            <span className="muted small">
              {Math.round(d.score * 100)}% · {(d.reasons ?? []).join(' · ')}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

export function Hooks() {
  const { data, error, loading } = useApi(api.hooks, []);
  if (loading) return <Loading error={error} />;
  const hooks = Object.entries(data ?? {});
  return (
    <>
      <Header title="Custom hooks" sub="Where each hook lives, what it reads and calls, and which components use it." />
      <Card title="Hooks" count={hooks.length}>
        <table>
          <thead>
            <tr>
              <th>Hook</th>
              <th>File</th>
              <th>Reads</th>
              <th>Calls</th>
              <th>Used by</th>
            </tr>
          </thead>
          <tbody>
            {hooks.map(([id, h]) => (
              <tr key={id}>
                <td>
                  <code>{id.split('@')[0]}</code>
                </td>
                <td>
                  <FileRef at={`${h.file}${h.line ? `:${h.line}` : ''}`} />
                </td>
                <td className="small mono">{h.reads?.join(', ') ?? '–'}</td>
                <td className="small mono">{h.calls?.join(', ') ?? '–'}</td>
                <td>{h.usedBy?.map((x) => <CompLink key={x} id={x} />) ?? 'unused'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export function Pages() {
  const { data, error } = useApi(api.pages, []);
  if (!data) return <Loading error={error} />;
  const routes = Object.keys(data).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return (
    <>
      <Header title="Site map" sub="Every route the routers found, with the component that renders it." />
      <Card title="Pages" count={routes.length}>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Component</th>
              <th>Router</th>
              <th>Components</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r}>
                <td>
                  <Link className="mono" to="/page" search={{ route: r }}>
                    {r}
                  </Link>
                </td>
                <td>{data[r].component ? <CompLink id={data[r].component} /> : '–'}</td>
                <td>
                  <span className="badge">{data[r].router ?? '–'}</span>
                </td>
                <td>{data[r].components?.length ?? 0}</td>
                <td>
                  <FileRef at={data[r].file} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export function PageView({ route }: { route: string }) {
  const { data, error } = useApi(api.pages, []);
  if (!data) return <Loading error={error} />;
  const p = data[route];
  if (!p) return <Loading error={`no page "${route}"`} />;
  const linkedFrom = Object.entries(data)
    .filter(([r, q]) => r !== route && q.linksTo?.includes(route))
    .map(([r]) => r);
  return (
    <>
      <Header
        title={<span className="mono">{route}</span>}
        badges={
          <>
            {p.router && <span className="badge">{p.router}</span>}
            {p.metadata && <span className="badge">metadata: {p.metadata}</span>}
          </>
        }
        sub={
          <>
            <FileRef at={p.file} />{' '}
            <Link to="/graph" search={{ focus: `p:${route}`, depth: 2 }}>
              show in graph
            </Link>
          </>
        }
      />
      <div className="grid">
        <Card title="Rendered by" wide={false}>
          <div className="chips">{p.component ? <CompLink id={p.component} /> : <p className="none">Unknown.</p>}</div>
        </Card>
        <Card title="Layouts" count={p.layouts?.length ?? 0} wide={false}>
          <div className="chips">{p.layouts?.length ? p.layouts.map((x) => <CompLink key={x} id={x} />) : <p className="none">No layouts.</p>}</div>
        </Card>
      </div>
      <div className="grid">
        <Card title="Links to" count={p.linksTo?.length ?? 0} wide={false} sub="Where the components on this page navigate.">
          <div className="chips">{p.linksTo?.map((r) => <PageLink key={r} route={r} />) ?? <p className="none">No links found.</p>}</div>
        </Card>
        <Card title="Linked from" count={linkedFrom.length} wide={false} sub="Pages whose components navigate here.">
          <div className="chips">{linkedFrom.length ? linkedFrom.map((r) => <PageLink key={r} route={r} />) : <p className="none">No links found.</p>}</div>
        </Card>
        {p.wrappers?.length || p.alternates?.length ? (
          <Card title="Guards and alternates" wide={false} sub="Wrappers around the page component, and what the route shows instead (loaders, redirects).">
            <div className="chips">
              {p.wrappers?.map((x) => <CompLink key={x} id={x} />)}
              {p.alternates?.map((x) => <CompLink key={x} id={x} />)}
            </div>
          </Card>
        ) : null}
      </div>
      <Card title="Components on this page" count={p.components?.length ?? 0}>
        <div className="chips">{p.components?.map((x) => <CompLink key={x} id={x} />)}</div>
      </Card>
    </>
  );
}

export function State() {
  const { data, error, loading } = useApi(api.stores, []);
  if (loading) return <Loading error={error} />;
  const stores = Object.entries(data ?? {});
  const chips = (ids?: string[]) => (ids?.length ? <div className="chips">{ids.map((x) => <CompLink key={x} id={x} />)}</div> : '–');
  return (
    <>
      <Header title="Global state" sub="Contexts and stores, who provides them, who reads them and who writes to them." />
      <Card title="Stores" count={stores.length}>
        <table>
          <thead>
            <tr>
              <th>Store</th>
              <th>Kind</th>
              <th>File</th>
              <th>Providers</th>
              <th>Readers</th>
              <th>Writers</th>
            </tr>
          </thead>
          <tbody>
            {stores.map(([key, s]) => (
              <tr key={key}>
                <td>
                  <code>{s.name}</code>
                </td>
                <td>
                  <span className="badge">{s.kind}</span>
                </td>
                <td>
                  <FileRef at={`${s.file}${s.line ? `:${s.line}` : ''}`} />
                </td>
                <td>{chips(s.providers)}</td>
                <td>{chips(s.readers)}</td>
                <td>{chips(s.writers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}


export function History() {
  const { data, error } = useApi(api.history, []);
  if (!data) return <Loading error={error} />;
  const commits = [...data].reverse();
  return (
    <>
      <Header title="History" sub="Every scan that changed the catalogue, newest first." />
      {!commits.length && <p className="none">No history yet (history is off, or nothing has been scanned twice).</p>}
      {commits.map((e) => {
        const shown = e.changes.slice(0, 30);
        return (
          <Card key={e.id} title={e.message ?? 'scan'} count={e.changes.length} sub={`${new Date(e.time).toLocaleString()}${e.git ? ` · git ${e.git}` : ''}`}>
            <div className="chips">
              {shown.map((c) =>
                c.kind === 'components' && c.change !== 'removed' ? (
                  <CompLink key={`${c.kind}:${c.key}`} id={c.key} />
                ) : (
                  <span key={`${c.kind}:${c.key}`} className="chip mono" title={`${c.kind} ${c.change}`}>
                    {c.key}
                  </span>
                ),
              )}
              {e.changes.length > shown.length && <span className="muted small">+{e.changes.length - shown.length} more</span>}
            </div>
          </Card>
        );
      })}
    </>
  );
}

/** Components by folder, one level at a time, like a file explorer. */
export function Folders({ path }: { path: string }) {
  const { data, error } = useApi(() => api.folders(path), [path]);
  const parts = path ? path.split('/') : [];
  return (
    <>
      <nav className="crumbs">
        <Link to="/folders" search={{ path: '' }}>
          All folders
        </Link>
        {parts.map((p, i) => (
          <span key={i}>
            <span className="sep"> / </span>
            {i === parts.length - 1 ? (
              <span className="here">{p}</span>
            ) : (
              <Link to="/folders" search={{ path: parts.slice(0, i + 1).join('/') }}>
                {p}
              </Link>
            )}
          </span>
        ))}
      </nav>
      <Header title={parts.at(-1) ?? 'Folders'} sub="Browse components by where they live." />
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          {data.dirs.length > 0 && (
            <Card title="Folders" count={data.dirs.length}>
              <div className="folder-tiles">
                {data.dirs.map((d) => (
                  <Link key={d.path} className="folder-tile" to="/folders" search={{ path: d.path }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="fn">{d.name}</div>
                      <div className="fm">
                        {d.count} components{d.withIssues ? ` · ${d.withIssues} with issues` : ''}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {data.items.length > 0 && (
            <Card title="Components" count={data.items.length}>
              <table>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <CompLink id={r.id} />
                      </td>
                      <td>
                        <span className="badge">{r.kind}</span>
                      </td>
                      <td>
                        <FileRef at={`${r.file}${r.line ? `:${r.line}` : ''}`} />
                      </td>
                      <td className="muted small">
                        used by {r.usedBy} · {r.pages} pages{r.issues ? ` · ${r.issues} issues` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
