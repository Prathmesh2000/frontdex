import { Link, useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { api, type DiffComponent, type DiffField } from './api';
import { Card, CompLink, FileRef, Header, Issues, Loading, PageLink, useApi } from './lib';

const MARK = { added: { sign: '+', color: 'var(--ok, #16a34a)' }, removed: { sign: '−', color: 'var(--danger, #dc2626)' }, modified: { sign: '~', color: 'var(--warn, #d97706)' } } as const;
const CHANGE_FILL = { added: '#dcfce7', removed: '#fee2e2', changed: '#fef3c7', renamed: '#e0f2fe' } as const;
const COLUMN_MAX = 24;

/** "props +1 −1 ~1 · renders +2" */
const fieldSummary = (fields: DiffField[] = []) =>
  fields.map((f) => ('from' in f || 'to' in f ? `${f.field} changed` : [f.field, f.added && `+${f.added.length}`, f.removed && `−${f.removed.length}`, f.modified && `~${f.modified.length}`].filter(Boolean).join(' '))).join(' · ');

/** One row per changed entry: what it was and what it is now, coloured by kind of change. */
function FieldRows({ fields }: { fields: DiffField[] }) {
  const rows: { field: string; kind: keyof typeof MARK; key?: string; before?: string; after?: string }[] = [];
  for (const f of fields) {
    if ('from' in f || 'to' in f) rows.push({ field: f.field, kind: 'modified', before: f.from, after: f.to });
    for (const e of f.added ?? []) rows.push({ field: f.field, kind: 'added', key: e.key, after: e.after });
    for (const e of f.removed ?? []) rows.push({ field: f.field, kind: 'removed', key: e.key, before: e.before });
    for (const e of f.modified ?? []) rows.push({ field: f.field, kind: 'modified', key: e.key, before: e.before, after: e.after });
  }
  if (!rows.length) return <p className="none">Only metadata changed.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th />
          <th>Entry</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="small">{i && rows[i - 1].field === r.field ? '' : r.field}</td>
            <td style={{ color: MARK[r.kind].color, fontWeight: 700 }}>{MARK[r.kind].sign}</td>
            <td className="mono small">{r.key ?? ''}</td>
            <td className="mono small" style={{ color: MARK.removed.color, textDecoration: r.before && r.kind !== 'added' ? 'line-through' : undefined }}>
              {r.before ?? ''}
            </td>
            <td className="mono small" style={{ color: MARK.added.color }}>
              {r.after ?? ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Blast radius at a glance: changed components (coloured by kind) → the components that render them → the pages they
 * reach. Columns are capped so a large change stays readable.
 */
function ImpactGraph({ components }: { components: DiffComponent[] }) {
  const navigate = useNavigate();
  const changed = components.slice(0, COLUMN_MAX);
  const dependents = [...new Set(changed.flatMap((c) => c.dependents))].filter((d) => !changed.some((c) => c.id === d)).slice(0, COLUMN_MAX);
  const pages = [...new Set(changed.flatMap((c) => c.pages))].slice(0, COLUMN_MAX);
  const H = 30;
  const GAP = 10;
  const W = 220;
  const X = [20, 320, 620];
  const rows = Math.max(changed.length, dependents.length, pages.length, 1);
  const y = (i: number, n: number) => 40 + ((rows - n) * (H + GAP)) / 2 + i * (H + GAP);
  const pos = new Map<string, { x: number; y: number }>();
  changed.forEach((c, i) => pos.set(`c:${c.id}`, { x: X[0], y: y(i, changed.length) }));
  dependents.forEach((d, i) => pos.set(`d:${d}`, { x: X[1], y: y(i, dependents.length) }));
  pages.forEach((p, i) => pos.set(`p:${p}`, { x: X[2], y: y(i, pages.length) }));
  const edges: [string, string][] = [];
  for (const c of changed) {
    for (const d of c.dependents) if (pos.has(`d:${d}`)) edges.push([`c:${c.id}`, `d:${d}`]);
    for (const p of c.pages) if (pos.has(`p:${p}`)) edges.push([c.dependents.length ? `d:${c.dependents.find((d) => pos.has(`d:${d}`)) ?? ''}` : `c:${c.id}`, `p:${p}`]);
  }
  const height = 50 + rows * (H + GAP);
  const label = (s: string) => (s.length > 28 ? `${s.slice(0, 27)}…` : s.split('@')[0]);
  const node = (key: string, text: string, fill: string, go: () => void, cls = '') => {
    const p = pos.get(key)!;
    return (
      <g key={key} className={`node ${cls}`} transform={`translate(${p.x},${p.y})`} onClick={go}>
        <title>{text}</title>
        <rect className="box" width={W} height={H} style={{ fill }} />
        <text x={10} y={19}>
          {label(text)}
        </text>
      </g>
    );
  };
  return (
    <div className="graph-wrap inline" style={{ cursor: 'default' }}>
      <svg className="graph" width={X[2] + W + 20} height={height}>
        {['CHANGED', 'RENDERED BY', 'PAGES'].map((t, i) => (
          <text key={t} className="col-title" x={X[i]} y={20}>
            {t}
          </text>
        ))}
        {edges
          .filter(([a, b]) => pos.has(a) && pos.has(b))
          .map(([a, b]) => {
            const s = pos.get(a)!;
            const t = pos.get(b)!;
            const [x1, y1, x2, y2] = [s.x + W, s.y + H / 2, t.x, t.y + H / 2];
            return <path key={`${a}>${b}`} className="edge" d={`M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}`} />;
          })}
        {changed.map((c) => node(`c:${c.id}`, c.id, CHANGE_FILL[c.change], () => c.change !== 'removed' && navigate({ to: '/c/$id', params: { id: c.id } })))}
        {dependents.map((d) => node(`d:${d}`, d, 'var(--surface)', () => navigate({ to: '/c/$id', params: { id: d } })))}
        {pages.map((p) => node(`p:${p}`, p, '', () => navigate({ to: '/page', search: { route: p } }), 'page'))}
      </svg>
    </div>
  );
}

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
      <Header title="Changes" sub="What a change does to the frontend: each component's props, children, conditions and links before and after, and every page it reaches." />
      <form className="toolbar" style={{ position: 'static' }} onSubmit={submit}>
        <input className="filter-input" style={{ width: 220 }} name="base" defaultValue={base} placeholder="base (e.g. main)" />
        <input className="filter-input" style={{ width: 260 }} name="head" defaultValue={head ?? ''} placeholder="head (empty = working tree)" />
        <button className="btn">Compare</button>
      </form>
      {!r ? (
        <Loading error={error} />
      ) : !r.components.length && !r.pages.length && !r.endpoints.length ? (
        <p className="none">
          No frontend changes between <code>{r.base}</code> and <code>{r.head}</code>.
        </p>
      ) : (
        <>
          {r.components.length > 0 && (
            <Card title="Impact" count={r.affectedPages.length} sub={`${r.components.length} component(s) changed, ${r.affectedPages.length} page(s) affected · ${r.base} → ${r.head}`}>
              <ImpactGraph components={r.components} />
            </Card>
          )}
          {r.components.map((c) => (
            <Card
              key={c.id}
              title={
                <>
                  <span className="badge" style={{ background: CHANGE_FILL[c.change], color: '#111' }}>
                    {c.change}
                  </span>{' '}
                  {c.change === 'removed' ? <code>{c.id}</code> : <CompLink id={c.id} />}
                  {c.from && <span className="muted small"> from {c.from}</span>}
                </>
              }
              count={fieldSummary(c.fields)}
              sub={
                <>
                  <FileRef at={c.file} /> · reaches {c.pages.length} page(s){c.dependents.length ? `, ${c.dependents.length} dependent component(s)` : ''}
                </>
              }
            >
              <FieldRows fields={c.fields ?? []} />
              {c.pages.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {c.pages.slice(0, 12).map((p) => (
                    <PageLink key={p} route={p} />
                  ))}
                  {c.pages.length > 12 && <span className="muted small">+{c.pages.length - 12} more</span>}
                </div>
              )}
            </Card>
          ))}
          {(r.pages.length > 0 || r.endpoints.length > 0) && (
            <Card title="Routes and endpoints" count={r.pages.length + r.endpoints.length}>
              {r.pages.map((p) => (
                <div key={p.route}>
                  <span className="badge">{p.change}</span> <Link to="/page" search={{ route: p.route }}>{p.route}</Link> <span className="muted small">{p.details.join('; ')}</span>
                </div>
              ))}
              {r.endpoints.map((e) => (
                <div key={e.key}>
                  <span className="badge">{e.change}</span> <code>{e.key}</code>
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
