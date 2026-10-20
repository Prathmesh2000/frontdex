import { Link } from '@tanstack/react-router';
import { api, type Component } from './api';
import { Card, CompLink, FileRef, Header, Loading, useApi } from './lib';

const STATE_LABEL = { fresh: 'current', stale: 'stale: the component changed since', none: 'none' } as const;

/** How to unlock docs: they come from a coding agent connected through frontdex-mcp. */
export function DocsHint({ name }: { name?: string }) {
  return (
    <p className="none">
      No docs yet. Connect <code>frontdex-mcp</code> to your coding agent and ask it to {name ? <>document <code>{name}</code></> : 'document your components'} (tools <code>catalogue_enrich_next</code> and <code>catalogue_enrich_write</code>). The docs are saved in <code>.frontdex/enrichment/</code> and appear here.
    </p>
  );
}

/**
 * The component's docs page, Storybook-style: purpose, how it works, props (type from the code, meaning and how to
 * pass it from the agent's docs), functions, usage examples and notes. The live preview card above it, when running
 * inside Vite, renders the component itself.
 */
export function ComponentDocs({ c }: { c: Component }) {
  const { data, error } = useApi(() => api.enrichment(c.id), [c.id]);
  if (!data) return error ? null : <Loading />;
  if (!data.record) {
    return (
      <Card title="Docs">
        <DocsHint name={c.name} />
      </Card>
    );
  }
  const { doc, writtenAt, by } = data.record;
  const propNames = [...new Set([...Object.keys(c.props ?? {}), ...Object.keys(doc.props ?? {})])];
  return (
    <Card
      title="Docs"
      count={data.state === 'stale' ? 'stale' : undefined}
      sub={
        <>
          Written {writtenAt.slice(0, 10)}
          {by ? ` by ${by}` : ''} through MCP{data.state === 'stale' ? ' · the component changed since, ask your agent to refresh them' : ''}.
        </>
      }
    >
      <p className="desc" style={{ fontSize: 15 }}>
        {doc.purpose}
      </p>
      {doc.summary && <p>{doc.summary}</p>}
      {propNames.length > 0 && (
        <>
          <h4>Props</h4>
          <table>
            <thead>
              <tr>
                <th>Prop</th>
                <th>Type</th>
                <th>What it does</th>
                <th>How to pass it</th>
              </tr>
            </thead>
            <tbody>
              {propNames.map((k) => {
                const code = c.props?.[k];
                const d = doc.props?.[k];
                return (
                  <tr key={k}>
                    <td>
                      <code>
                        {k}
                        {code && !code.required ? '?' : ''}
                      </code>
                    </td>
                    <td className="small mono">
                      {code?.type ?? <span className="muted">not in code</span>}
                      {code?.default !== undefined ? ` = ${code.default}` : ''}
                    </td>
                    <td className="small">{d?.description ?? <span className="muted">–</span>}</td>
                    <td className="small">
                      {d?.howToPass}
                      {d?.example && (
                        <>
                          {d.howToPass ? <br /> : null}
                          <code>{d.example}</code>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {doc.functions && Object.keys(doc.functions).length > 0 && (
        <>
          <h4>Functions</h4>
          <table>
            <tbody>
              {Object.entries(doc.functions).map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <code>{k}</code>
                  </td>
                  <td className="small">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {doc.usage?.map((u) => (
        <div key={u.title}>
          <h4>{u.title}</h4>
          <pre className="source" style={{ padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
            {u.code}
          </pre>
        </div>
      ))}
      {doc.notes?.length ? (
        <>
          <h4>Notes</h4>
          <ul>
            {doc.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/** Docs coverage: what agents have documented, what is stale, and what to document next. */
export function Docs() {
  const { data, error } = useApi(api.enrichmentOverview, []);
  if (!data) return <Loading error={error} />;
  const { summary, documented, next } = data;
  const pct = summary.components ? Math.round((100 * summary.fresh) / summary.components) : 0;
  return (
    <>
      <Header title="Docs" sub="Component docs written by coding agents through frontdex-mcp: purpose, props and how to pass them, functions, usage and notes. Kept in .frontdex/enrichment/." />
      <div className="stats">
        <div className="stat">
          <div>
            <div className="v">{pct}%</div>
            <div className="k">documented and current</div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="v">{summary.documented}</div>
            <div className="k">of {summary.components} components documented</div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="v">{summary.stale}</div>
            <div className="k">stale (component changed)</div>
          </div>
        </div>
      </div>
      {!documented.length && (
        <Card title="Getting started">
          <DocsHint />
        </Card>
      )}
      {documented.length > 0 && (
        <Card title="Documented" count={documented.length}>
          <table>
            <tbody>
              {documented.map((d) => (
                <tr key={d.id}>
                  <td>
                    <CompLink id={d.id} />
                  </td>
                  <td className="small">{d.purpose}</td>
                  <td>
                    <span className={`badge${d.state === 'stale' ? ' sev-medium' : ''}`}>{STATE_LABEL[d.state]}</span>
                  </td>
                  <td className="muted small">
                    {d.writtenAt.slice(0, 10)}
                    {d.by ? ` · ${d.by}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Card title="Document next" count={next.length} sub="Undocumented or stale components developers meet most (shared, on many pages, with props to get right). This is the order catalogue_enrich_next gives agents.">
        <table>
          <tbody>
            {next.map((n) => (
              <tr key={n.id}>
                <td>
                  <Link to="/c/$id" params={{ id: n.id }}>
                    {n.name}
                  </Link>
                </td>
                <td>
                  <FileRef at={n.file} />
                </td>
                <td className="muted small">
                  used by {n.usedBy} · {n.pages} page(s)
                </td>
                <td>{n.state === 'stale' && <span className="badge sev-medium">stale</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
