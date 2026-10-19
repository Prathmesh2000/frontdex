import { Link, useNavigate } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { api, type ComponentRow, type Issue } from './api';
import { Card, CompLink, FileRef, Header, Issues, Loading, Swatch, useApi } from './lib';

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

export function ComponentView({ id }: { id: string }) {
  const { data: c, error } = useApi(() => api.component(id), [id]);
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
        <Card title="Renders" count={c.renders?.length ?? 0} wide={false}>
          <div className="chips">{c.renders?.map((x) => <CompLink key={x} id={x} />) ?? <p className="none">No child components.</p>}</div>
        </Card>
        <Card title="Pages" count={c.pages?.length ?? 0} wide={false}>
          <div className="chips">{c.pages?.map((p) => <span key={p} className="chip mono">{p}</span>) ?? <p className="none">Not on any page.</p>}</div>
        </Card>
      </div>
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

const CHANGE_CLS = { added: 'sev-info', removed: 'danger', changed: 'sev-low' } as const;

/** What changed in the UI between two git refs (or a ref and the working tree), the same report as `frontdex diff`. */
export function Changes({ base, head }: { base: string; head?: string }) {
  const navigate = useNavigate();
  const { data: r, error } = useApi(() => api.diff(base, head), [base, head]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    navigate({ to: '/changes', search: { base: String(f.get('base') || 'HEAD'), head: String(f.get('head') || '') || undefined } });
  };
  return (
    <>
      <Header title="Changes" sub="Components, pages and endpoints that changed between two git refs, the pages they reach, and new issues." />
      <form className="toolbar" style={{ position: 'static' }} onSubmit={submit}>
        <input name="base" defaultValue={base} placeholder="base (e.g. main)" />
        <input name="head" defaultValue={head ?? ''} placeholder="head (empty = working tree)" />
        <button className="btn">Compare</button>
      </form>
      {!r ? (
        <Loading error={error} />
      ) : (
        <>
          <Card title="Components" count={r.components.length} sub={`${r.base} → ${r.head}`}>
            {r.components.length ? (
              <table>
                <tbody>
                  {r.components.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className={`badge ${CHANGE_CLS[c.change]}`}>{c.change}</span>
                      </td>
                      <td>{c.change === 'removed' ? <code>{c.id}</code> : <CompLink id={c.id} />}</td>
                      <td className="small">{c.details.join('; ')}</td>
                      <td className="muted small">
                        {c.pages.length} pages · {c.dependents.length} dependents
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="none">No component changes.</p>
            )}
          </Card>
          <Card title="Pages affected" count={r.affectedPages.length}>
            <div className="chips">
              {r.affectedPages.map((p) => (
                <Link key={p} className="chip mono" to="/page" search={{ route: p }}>
                  {p}
                </Link>
              ))}
            </div>
          </Card>
          {r.endpoints.length > 0 && (
            <Card title="Endpoints" count={r.endpoints.length}>
              {r.endpoints.map((e) => (
                <div key={e.key}>
                  <span className={`badge ${CHANGE_CLS[e.change]}`}>{e.change}</span> <code>{e.key}</code>
                </div>
              ))}
            </Card>
          )}
          <Card title="New issues" count={r.newIssues.length} sub={r.fixedIssues ? `${r.fixedIssues} fixed` : undefined}>
            <Issues items={r.newIssues} />
          </Card>
        </>
      )}
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
