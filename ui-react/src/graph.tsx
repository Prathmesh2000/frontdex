import { Link, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { api, type Graph } from './api';
import { Header, Loading, useApi } from './lib';

interface Node { key: string; label: string; title: string; to: () => void; hue?: number; cls: string }
interface Column { title: string; nodes: Node[]; x?: number }

const NODE_H = 30;
const V_GAP = 10;
const H_GAP = 80;
const PAD = 20;
const TOP = 34;
const widthOf = (label: string) => Math.min(250, Math.max(96, label.length * 7.4 + 30));

// Stable colour per top-level folder pair, so neighbours from one feature read as a group.
const hueOf = (file: string) => {
  const top = file.split('/').slice(0, 2).join('/');
  let h = 0;
  for (const ch of top) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

/**
 * Same layered layout as the classic UI: pages in the first column, each component one column right of its
 * deepest parent, then each column ordered by the mean row of its parents to cut edge crossings.
 */
function layout(g: Graph, focus: string | undefined, open: (key: string) => void) {
  const ids = Object.keys(g.nodes);
  const routes = Object.keys(g.pages);
  const rootsOf = (r: string) => [...g.pages[r].layouts, g.pages[r].component].filter((x): x is string => !!x);
  const roots = new Set(routes.flatMap(rootsOf));
  const depth = new Map(ids.map((id) => [id, roots.has(id) || !g.nodes[id].usedBy.length ? 1 : 0]));
  // Longest-path layering; the iteration bound stops cycles (A renders B renders A) from looping forever.
  for (let i = 0; i < ids.length; i++) {
    let changed = false;
    for (const id of ids)
      for (const child of g.nodes[id].renders) {
        const d = Math.max(1, depth.get(id)!) + 1;
        if (d > depth.get(child)! && d <= ids.length + 1) {
          depth.set(child, d);
          changed = true;
        }
      }
    if (!changed) break;
  }
  const maxDepth = Math.max(1, ...depth.values());
  const node = (id: string): Node => ({ key: `c:${id}`, label: g.nodes[id].name, title: `${g.nodes[id].name} — ${g.nodes[id].file}`, hue: hueOf(g.nodes[id].file), cls: focus === `c:${id}` ? 'focus' : '', to: () => open(`c:${id}`) });
  const columns: Column[] = [{ title: 'PAGES', nodes: routes.map((r) => ({ key: `p:${r}`, label: r, title: `${r} → ${g.pages[r].component ?? '?'}`, cls: `page${focus === `p:${r}` ? ' focus' : ''}`, to: () => open(`p:${r}`) })) }];
  for (let d = 1; d <= maxDepth; d++) columns.push({ title: d === 1 ? 'ROOTS' : `DEPTH ${d}`, nodes: ids.filter((id) => Math.max(1, depth.get(id)!) === d).map(node) });

  const edges: { from: string; to: string }[] = [];
  for (const r of routes) rootsOf(r).forEach((id) => edges.push({ from: `p:${r}`, to: `c:${id}` }));
  for (const id of ids) g.nodes[id].renders.forEach((c) => edges.push({ from: `c:${id}`, to: `c:${c}` }));
  const parentsOf = new Map<string, string[]>();
  edges.forEach((e) => (parentsOf.get(e.to) ?? parentsOf.set(e.to, []).get(e.to)!).push(e.from));
  const row = new Map(columns[0].nodes.map((n, i) => [n.key, i]));
  for (const col of columns.slice(1)) {
    const score = (n: Node) => {
      const ps = (parentsOf.get(n.key) ?? []).filter((k) => row.has(k)).map((k) => row.get(k)!);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity;
    };
    col.nodes = col.nodes.map((n) => [score(n), n] as const).sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label, undefined, { numeric: true })).map((x) => x[1]);
    col.nodes.forEach((n, i) => row.set(n.key, i));
  }

  const cols = columns.filter((c) => c.nodes.length);
  const maxRows = Math.max(1, ...cols.map((c) => c.nodes.length));
  const pos = new Map<string, { x: number; y: number; w: number }>();
  let x = PAD;
  for (const col of cols) {
    const offset = ((maxRows - col.nodes.length) * (NODE_H + V_GAP)) / 2;
    col.nodes.forEach((n, i) => pos.set(n.key, { x, y: TOP + offset + i * (NODE_H + V_GAP), w: widthOf(n.label) }));
    col.x = x;
    x += Math.max(96, ...col.nodes.map((n) => widthOf(n.label))) + H_GAP;
  }
  return { cols, edges: edges.filter((e) => pos.has(e.from) && pos.has(e.to)), pos, width: x - H_GAP + PAD, height: TOP + maxRows * (NODE_H + V_GAP) + PAD };
}

function GraphSVG({ g, focus, open }: { g: Graph; focus?: string; open: (key: string) => void }) {
  const [hot, setHot] = useState<string>();
  const [scale, setScale] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean }>(null);
  const { cols, edges, pos, width, height } = layout(g, focus, open);
  const linked = new Set(hot ? [hot, ...edges.flatMap((e) => (e.from === hot || e.to === hot ? [e.from, e.to] : []))] : []);
  const zoom = (f: number) => setScale((s) => Math.min(3, Math.max(0.2, s * f)));
  const fit = () => wrap.current && setScale(Math.min(3, Math.max(0.2, Math.min(wrap.current.clientWidth / width, wrap.current.clientHeight / height))));
  return (
    <>
      <span className="btn-row" style={{ marginLeft: 'auto' }}>
        <button className="btn" onClick={() => zoom(0.8)}>−</button>
        <button className="btn" onClick={() => zoom(1.25)}>+</button>
        <button className="btn" onClick={fit}>Fit</button>
      </span>
      <div
        ref={wrap}
        className="graph-wrap"
        onPointerDown={(e) => e.button === 0 && (drag.current = { x: e.clientX, y: e.clientY, sl: wrap.current!.scrollLeft, st: wrap.current!.scrollTop, moved: false })}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
            d.moved = true;
            // Capture only once a drag starts, otherwise node clicks would retarget to the wrapper.
            wrap.current!.setPointerCapture(e.pointerId);
          }
          if (d.moved) {
            wrap.current!.scrollLeft = d.sl - dx;
            wrap.current!.scrollTop = d.st - dy;
          }
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null))}
        onWheel={(e) => (e.ctrlKey || e.metaKey) && zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
      >
        <svg className="graph" width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`} onMouseLeave={() => setHot(undefined)}>
          {edges.map((e) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const [x1, y1, x2, y2] = [a.x + a.w, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2];
            const dx = Math.max(30, Math.abs(x2 - x1) / 2);
            return <path key={`${e.from}>${e.to}`} className={`edge${hot && (e.from === hot || e.to === hot) ? ' hot' : ''}`} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} />;
          })}
          {cols.map((c) => (
            <text key={c.title} className="col-title" x={c.x} y={18}>
              {c.title}
            </text>
          ))}
          {cols.flatMap((c) =>
            c.nodes.map((n) => {
              const p = pos.get(n.key)!;
              return (
                <g key={n.key} className={`node ${n.cls}${hot && !linked.has(n.key) ? ' dim' : ''}`} transform={`translate(${p.x},${p.y})`} onMouseOver={() => setHot(n.key)} onClick={() => !drag.current?.moved && n.to()}>
                  <title>{n.title}</title>
                  <rect className="box" width={p.w} height={NODE_H} />
                  {n.hue != null && <rect width={4} height={NODE_H} rx={2} style={{ fill: `hsl(${n.hue} 65% 55%)` }} />}
                  <text x={13} y={19}>
                    {n.label.length > 32 ? `${n.label.slice(0, 31)}…` : n.label}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </>
  );
}

/** Graph explorer: a focus (component or page) walked ±depth, a folder, or the whole app when it is small enough. */
export function GraphView({ focus, depth, dir }: { focus?: string; depth: number; dir?: string }) {
  const navigate = useNavigate();
  const [force, setForce] = useState(false);
  const { data: g, error } = useApi(() => api.graph({ focus, depth, dir, force: force ? 1 : undefined }), [focus, depth, dir, force]);
  const go = (patch: { focus?: string; depth?: number; dir?: string }) => navigate({ to: '/graph', search: { focus, depth, dir, ...patch } });
  // Clicking a node refocuses the graph on it; the header link opens its detail page.
  const open = (key: string) => go({ focus: key, dir: undefined });
  const focusLink = focus?.startsWith('c:') ? (
    <Link to="/c/$id" params={{ id: focus.slice(2) }}>open {focus.slice(2)}</Link>
  ) : focus?.startsWith('p:') ? (
    <Link to="/page" search={{ route: focus.slice(2) }}>open page {focus.slice(2)}</Link>
  ) : null;
  return (
    <>
      <Header title="Graph explorer" sub="Pages on the left; each column is one level deeper in the render tree. Hover to trace, click to refocus, drag to pan, Ctrl + wheel to zoom." />
      <div className="graph-bar">
        <input key={focus} defaultValue={focus ?? ''} placeholder="Focus: c:Button or p:/checkout" onKeyDown={(e) => e.key === 'Enter' && go({ focus: e.currentTarget.value.trim() || undefined, dir: undefined })} />
        <select value={depth} onChange={(e) => go({ depth: Number(e.target.value) })}>
          {[1, 2, 3, 4, 6, 8].map((d) => (
            <option key={d} value={d}>
              ±{d} levels
            </option>
          ))}
        </select>
        <input key={`d${dir}`} defaultValue={dir ?? ''} placeholder="Folder: src/features" onKeyDown={(e) => e.key === 'Enter' && go({ dir: e.currentTarget.value.trim() || undefined, focus: undefined })} />
        <button className="btn" onClick={() => navigate({ to: '/graph', search: { depth: 2 } })}>
          Reset
        </button>
        {focusLink}
      </div>
      {!g ? (
        <Loading error={error} />
      ) : g.truncated ? (
        <div className="graph-wrap">
          <div className="graph-note">
            <p>
              <b>{g.total} nodes</b> is too many to read at once.
            </p>
            <p>
              Pick a focus or a folder above, or{' '}
              <a href="#" onClick={(e) => (e.preventDefault(), setForce(true))}>
                render everything anyway
              </a>
              .
            </p>
          </div>
        </div>
      ) : g.total ? (
        <GraphSVG g={g} focus={focus} open={open} />
      ) : (
        <p className="none">Nothing to draw.</p>
      )}
    </>
  );
}
