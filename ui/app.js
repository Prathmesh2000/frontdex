(() => {
  const cat = window.__CATALOGUE__;
  const ROOT = window.__CATALOGUE_ROOT__;
  const $ = (s) => document.querySelector(s);
  const main = $('#main');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  if (!cat) {
    main.innerHTML = '<p>No catalogue data found. Run <code>rcat generate</code> and reload.</p>';
    return;
  }

  const C = cat.components || {};
  const P = cat.pages || {};
  const ui = { tab: 'components', query: '' };
  const compHref = (id) => '#/c/' + encodeURIComponent(id);
  const pageHref = (r) => '#/p/' + encodeURIComponent(r);
  const ROUTER_LABEL = { 'next-app': 'app', 'next-pages': 'pages', 'react-router': 'rr' };
  const PHASES = ['mount', 'update', 'unmount', 'error'];

  const info = cat.info || {};
  $('#title').textContent = info.title || 'Catalogue';
  document.title = `${info.title || 'Frontend'} · Catalogue`;
  $('#meta').textContent = [info.version && `v${info.version}`, info.framework, (info.routers || []).join(', ')].filter(Boolean).join(' · ');

  // ---------- helpers ----------
  const compChip = (id, extra = '') =>
    C[id] ? `<a class="chip" href="${compHref(id)}" title="${esc(C[id].file)}">${esc(C[id].name)}${extra}</a>` : `<span class="chip">${esc(id)}</span>`;
  const pageChip = (r) => `<a class="chip page" href="${pageHref(r)}">${esc(r)}</a>`;
  const chips = (items, fn, empty = 'None') => (items && items.length ? `<div class="chips">${items.map(fn).join('')}</div>` : `<p class="none">${empty}</p>`);
  const card = (title, body, { wide = false, count } = {}) =>
    `<section class="card${wide ? ' wide' : ''}"><h2><span>${title}</span>${count != null ? `<span class="count">${count}</span>` : ''}</h2>${body}</section>`;
  const kindBadge = (c) => `<span class="badge kind-${esc(c.kind)}">${esc(c.kind)}</span>`;
  const statusBadge = (c) => (c.status ? `<span class="badge ${c.status === 'deprecated' ? 'deprecated' : ''}">${esc(c.status)}</span>` : '');
  const dirOf = (file) => file.split('/').slice(0, -1).join('/') || '.';

  const compHay = Object.fromEntries(
    Object.entries(C).map(([id, c]) => [
      id,
      [id, c.file, c.description, c.kind, ...Object.keys(c.props || {}), ...Object.keys(c.state || {}), ...(c.hooks || []).map((h) => h.name), ...(c.context || []), ...(c.tags || []), ...(c.externals || [])]
        .join(' ')
        .toLowerCase(),
    ]),
  );
  const pageHay = Object.fromEntries(Object.entries(P).map(([r, p]) => [r, [r, p.file, p.router, p.component, ...(p.components || []), ...(p.tags || [])].join(' ').toLowerCase()]));

  // ---------- sidebar ----------
  function renderList() {
    const terms = ui.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (hay) => terms.every((t) => hay.includes(t));
    const comps = Object.keys(C).filter((id) => match(compHay[id]));
    const pages = Object.keys(P).filter((r) => match(pageHay[r]));
    $('#count-components').textContent = comps.length;
    $('#count-pages').textContent = pages.length;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));

    const rows =
      ui.tab === 'components'
        ? comps.map((id) => {
            const c = C[id];
            return `<li><a href="${compHref(id)}" data-key="c:${esc(id)}"><span class="row"><strong>${esc(c.name)}</strong>${c.kind !== 'function' ? kindBadge(c) : ''}${c.status === 'deprecated' ? statusBadge(c) : ''}</span><span class="sub">${esc(dirOf(c.file))}</span></a></li>`;
          })
        : pages.map((r) => {
            const p = P[r];
            return `<li><a href="${pageHref(r)}" data-key="p:${esc(r)}"><span class="row"><span class="badge page">${ROUTER_LABEL[p.router] || p.router}</span><strong class="mono">${esc(r)}</strong></span><span class="sub">${esc(p.component || p.file)}</span></a></li>`;
          });
    $('#list').innerHTML = rows.join('') || `<li class="empty">No ${ui.tab} match “${esc(ui.query)}”.</li>`;
    markActive();
  }

  function markActive() {
    const [, type, ...rest] = (location.hash.slice(1) || '/').split('/');
    const key = `${type}:${decodeURIComponent(rest.join('/'))}`;
    document.querySelectorAll('#list a').forEach((a) => a.classList.toggle('active', a.dataset.key === key));
  }

  // ---------- graph ----------
  function graphSVG(columns, edges, { inline = false } = {}) {
    const NODE_H = 30;
    const V_GAP = 12;
    const H_GAP = 70;
    const PAD = 20;
    const TOP = 34;
    const widthOf = (label) => Math.min(260, Math.max(90, label.length * 7.3 + 24));
    const colWidths = columns.map((col) => Math.max(90, ...col.nodes.map((n) => widthOf(n.label))));
    const maxRows = Math.max(1, ...columns.map((c) => c.nodes.length));
    const height = TOP + maxRows * (NODE_H + V_GAP) + PAD;
    const pos = new Map();
    let x = PAD;
    columns.forEach((col, ci) => {
      const offset = ((maxRows - col.nodes.length) * (NODE_H + V_GAP)) / 2;
      col.nodes.forEach((n, i) => pos.set(n.key, { x, y: TOP + offset + i * (NODE_H + V_GAP), w: widthOf(n.label), col: ci }));
      col.x = x;
      x += colWidths[ci] + H_GAP;
    });
    const width = x - H_GAP + PAD;

    const edgeSvg = edges
      .filter((e) => pos.has(e.from) && pos.has(e.to))
      .map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        const x1 = a.x + a.w;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const dx = Math.max(30, Math.abs(x2 - x1) / 2);
        return `<path class="edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" ${e.dashed ? 'stroke-dasharray="4 4"' : ''} d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
      })
      .join('');
    const titles = columns.map((c) => (c.title ? `<text class="col-title" x="${c.x}" y="18">${esc(c.title)}</text>` : '')).join('');
    const nodes = columns
      .flatMap((col) =>
        col.nodes.map((n) => {
          const p = pos.get(n.key);
          const label = n.label.length > 34 ? n.label.slice(0, 33) + '…' : n.label;
          return `<g class="node ${n.cls || ''}" data-key="${esc(n.key)}" data-href="${esc(n.href || '')}" transform="translate(${p.x},${p.y})"><title>${esc(n.title || n.label)}</title><rect width="${p.w}" height="${NODE_H}"/><text x="12" y="19">${esc(label)}</text></g>`;
        }),
      )
      .join('');
    return `<div class="graph-wrap${inline ? ' inline' : ''}"><svg class="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edgeSvg}${titles}${nodes}</svg></div>`;
  }

  function wireGraphs() {
    main.querySelectorAll('svg.graph').forEach((svg) => {
      const edges = [...svg.querySelectorAll('.edge')];
      const nodes = [...svg.querySelectorAll('.node')];
      nodes.forEach((g) => {
        g.addEventListener('click', () => g.dataset.href && (location.hash = g.dataset.href));
        g.addEventListener('mouseenter', () => {
          const key = g.dataset.key;
          const linked = new Set([key]);
          edges.forEach((e) => {
            const hot = e.dataset.from === key || e.dataset.to === key;
            e.classList.toggle('hot', hot);
            if (hot) linked.add(e.dataset.from).add(e.dataset.to);
          });
          nodes.forEach((n) => n.classList.toggle('dim', !linked.has(n.dataset.key)));
          g.classList.add('hot');
        });
        g.addEventListener('mouseleave', () => {
          edges.forEach((e) => e.classList.remove('hot'));
          nodes.forEach((n) => n.classList.remove('dim', 'hot'));
        });
      });
    });
  }

  /** Layered layout: pages in column 0, components by longest path from a root, ordered by parent barycenter. */
  function layeredGraph(routes, compIds) {
    const ids = new Set(compIds);
    const depth = new Map();
    for (const id of ids) depth.set(id, (C[id].usedBy || []).some((u) => ids.has(u)) ? 0 : 1);
    for (const r of routes) [...(P[r].layouts || []), P[r].component].filter((id) => ids.has(id)).forEach((id) => depth.set(id, Math.max(depth.get(id), 1)));
    for (let i = 0; i < ids.size; i++) {
      let changed = false;
      for (const id of ids) {
        for (const child of C[id].renders || []) {
          if (!ids.has(child)) continue;
          const d = Math.max(1, depth.get(id)) + 1;
          if (d > depth.get(child) && d <= ids.size + 1) {
            depth.set(child, d);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    const maxDepth = Math.max(1, ...depth.values());
    const columns = [{ title: 'Pages', nodes: routes.map((r) => ({ key: 'p:' + r, label: r, cls: 'page', href: pageHref(r), title: `${r} → ${P[r].component || '?'}` })) }];
    for (let d = 1; d <= maxDepth; d++) {
      columns.push({ title: d === 1 ? 'Roots' : `Depth ${d}`, nodes: [...ids].filter((id) => Math.max(1, depth.get(id)) === d).map((id) => ({ key: 'c:' + id, label: C[id].name, href: compHref(id), title: `${C[id].name} — ${C[id].file}` })) });
    }
    const edges = [];
    for (const r of routes) [...(P[r].layouts || []), P[r].component].filter((id) => ids.has(id)).forEach((id) => edges.push({ from: 'p:' + r, to: 'c:' + id }));
    for (const id of ids) (C[id].renders || []).filter((c) => ids.has(c)).forEach((c) => edges.push({ from: 'c:' + id, to: 'c:' + c }));

    const index = new Map();
    columns[0].nodes.forEach((n, i) => index.set(n.key, i));
    for (let ci = 1; ci < columns.length; ci++) {
      const score = (n) => {
        const parents = edges.filter((e) => e.to === n.key && index.has(e.from)).map((e) => index.get(e.from));
        return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : Infinity;
      };
      columns[ci].nodes.sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label));
      columns[ci].nodes.forEach((n, i) => index.set(n.key, i));
    }
    return graphSVG(columns.filter((c) => c.nodes.length), edges);
  }

  // ---------- lifecycle ----------
  const CLASS_TEXT = {
    constructor: { mount: 'initialises state' },
    UNSAFE_componentWillMount: { mount: 'before first render' },
    componentDidMount: { mount: 'after first render' },
    getDerivedStateFromProps: { mount: 'before render', update: 'before every render' },
    UNSAFE_componentWillReceiveProps: { update: 'when new props arrive' },
    shouldComponentUpdate: { update: 'decides whether to re-render' },
    getSnapshotBeforeUpdate: { update: 'right before DOM commit' },
    componentDidUpdate: { update: 'after each update' },
    componentWillUnmount: { unmount: 'before removal' },
    getDerivedStateFromError: { error: 'when a child throws (render phase)' },
    componentDidCatch: { error: 'when a child throws (commit phase)' },
  };

  function lifecycleView(c) {
    const events = c.lifecycle || [];
    if (!events.length) {
      return `<p class="none">${c.kind === 'class' ? 'No lifecycle methods besides render.' : 'No effects: output depends only on props, state and context.'}</p>`;
    }
    const setters = Object.fromEntries(Object.entries(c.state || {}).filter(([, s]) => s.setter).map(([name, s]) => [s.setter, s.source === 'class' ? 'state' : name]));
    const phases = PHASES.filter((ph) => ph !== 'error' || events.some((e) => e.phases.includes('error')));
    const callList = (calls) =>
      calls && calls.length
        ? `<ul>${calls.map((fn) => (setters[fn] ? `<li><code class="setter" title="updates state “${esc(setters[fn])}”">${esc(fn)}</code> → <code>${esc(setters[fn])}</code></li>` : `<li><code>${esc(fn)}</code></li>`)).join('')}</ul>`
        : '';
    const isEffect = (e) => /^use/.test(e.via);
    const when = (e) => (!isEffect(e) ? '' : !e.deps ? 'every render' : e.deps.length ? `deps: ${e.deps.join(', ')}` : 'once');

    const cell = (e, ph) => {
      if (!e.phases.includes(ph)) return `<div class="lc-cell"></div>`;
      let text;
      let calls = e.calls;
      if (isEffect(e)) {
        if (ph === 'mount') text = e.via === 'useEffect' ? 'after first paint' : 'before paint';
        if (ph === 'update') text = (e.deps ? `when <code>${esc(e.deps.join(', '))}</code> change` : 'after every render') + (e.cleanup ? ' (cleanup runs first)' : '');
        if (ph === 'unmount') {
          text = 'cleanup';
          calls = e.cleanup;
        }
      } else {
        text = CLASS_TEXT[e.via]?.[ph] || ph;
      }
      return `<div class="lc-cell ${ph}"><span class="dot"></span>${text}${callList(calls)}</div>`;
    };

    const head = `<div class="lc-head label">Hook / method</div>${phases.map((ph) => `<div class="lc-head ${ph}">${ph}</div>`).join('')}`;
    const rows = events
      .map((e) => `<div class="lc-label"><code>${esc(e.via)}</code>${e.line ? ` <span class="muted small">L${e.line}</span>` : ''}<div class="muted small">${esc(when(e))}</div></div>${phases.map((ph) => cell(e, ph)).join('')}`)
      .join('');
    return `<div class="lifecycle" style="grid-template-columns: minmax(150px, 1fr) repeat(${phases.length}, minmax(150px, 1fr))">${head}${rows}</div>`;
  }

  // ---------- views ----------
  function viewOverview() {
    const list = Object.entries(C);
    const unused = list.filter(([, c]) => !(c.usedBy || []).length && !(c.pages || []).length).map(([id]) => id);
    const reused = list.filter(([, c]) => (c.usedBy || []).length).sort((a, b) => b[1].usedBy.length - a[1].usedBy.length || (b[1].pages || []).length - (a[1].pages || []).length).slice(0, 10);
    const stat = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    const count = (fn) => list.filter(([, c]) => fn(c)).length;
    main.innerHTML = `
      <div class="page-head"><h1>${esc(info.title)}</h1><div class="muted small">Generated ${info.generatedAt ? new Date(info.generatedAt).toLocaleString() : ''} by ${esc(info.generator || 'react-catalogue')}</div>
      ${info.description ? `<p class="desc">${esc(info.description)}</p>` : ''}</div>
      <div class="stats">
        ${stat(list.length, 'components')}
        ${stat(Object.keys(P).length, 'pages')}
        ${stat(count((c) => c.kind === 'class'), 'class components')}
        ${stat(count((c) => Object.keys(c.state || {}).length), 'stateful')}
        ${stat(count((c) => (c.lifecycle || []).length), 'with effects / lifecycle')}
        ${stat(count((c) => c.status === 'deprecated'), 'deprecated')}
      </div>
      <div class="grid">
        ${card(
          'Pages',
          `<div class="table-wrap"><table><thead><tr><th>Route</th><th>Root component</th><th>Router</th><th>Components</th></tr></thead><tbody>${Object.entries(P)
            .map(([r, p]) => `<tr><td><a class="mono" href="${pageHref(r)}">${esc(r)}</a></td><td>${p.component ? compChip(p.component) : '<span class="none">unresolved</span>'}</td><td><span class="badge page">${esc(p.router)}</span></td><td>${(p.components || []).length}</td></tr>`)
            .join('')}</tbody></table></div>`,
          { count: Object.keys(P).length },
        )}
        ${card(
          'Most reused',
          reused.length
            ? `<table><thead><tr><th>Component</th><th>Used by</th><th>On pages</th></tr></thead><tbody>${reused.map(([id, c]) => `<tr><td>${compChip(id)}</td><td>${c.usedBy.length}</td><td>${(c.pages || []).length}</td></tr>`).join('')}</tbody></table>`
            : '<p class="none">No component is rendered by another one yet.</p>',
        )}
        ${card('Not reachable from any page', chips(unused, (id) => compChip(id), 'Every component is used.'), { count: unused.length })}
        ${card('Dependency graph', `${layeredGraph(Object.keys(P), Object.keys(C))}<p class="small muted">Hover a node to trace its links. <a href="#/graph">Open full screen</a></p>`, { wide: true })}
      </div>`;
  }

  function viewGraph() {
    main.innerHTML = `<div class="page-head"><h1>Dependency graph</h1><p class="muted">Pages on the left; each column is one level deeper in the render tree. Click a node to open it.</p></div>${layeredGraph(Object.keys(P), Object.keys(C))}`;
  }

  function viewComponent(id) {
    const c = C[id];
    if (!c) return notFound(`Component “${id}”`);
    const props = Object.entries(c.props || {});
    const state = Object.entries(c.state || {});
    const updatedIn = (setter) =>
      (c.lifecycle || [])
        .filter((e) => (e.calls || []).includes(setter) || (e.cleanup || []).includes(setter))
        .map((e) => `<code>${esc(e.via)}</code>${e.line ? ` <span class="muted small">L${e.line}</span>` : ''}`)
        .join(', ');

    const propsTable = props.length
      ? `<div class="table-wrap"><table><thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead><tbody>${props
          .map(([name, p]) => `<tr><td><code>${esc(name)}</code>${p.required ? ' <span class="req" title="required">*</span>' : ''}</td><td><code>${esc(p.type)}</code></td><td>${p.default != null ? `<code>${esc(p.default)}</code>` : ''}</td><td>${esc(p.description || '')}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '<p class="none">No props.</p>';

    const stateTable = state.length
      ? `<div class="table-wrap"><table><thead><tr><th>State</th><th>Source</th><th>Initial</th><th>Setter</th><th>Set in effects</th></tr></thead><tbody>${state
          .map(
            ([name, s]) =>
              `<tr><td><code>${esc(name)}</code>${s.type ? `<div class="muted small"><code>${esc(s.type)}</code></div>` : ''}</td><td>${esc(s.source)}${s.reducer ? `<div class="muted small">reducer <code>${esc(s.reducer)}</code></div>` : ''}</td><td><code>${esc(s.initial ?? '')}</code></td><td><code>${esc(s.setter ?? '')}</code></td><td>${s.setter ? updatedIn(s.setter) || '<span class="muted small">event handlers</span>' : ''}</td></tr>`,
          )
          .join('')}</tbody></table></div>`
      : '<p class="none">Stateless.</p>';

    const hooks = c.hooks || [];
    const hooksBody = `${chips(hooks, (h) => `<span class="chip hook-${esc(h.category)}" title="${esc(h.category)}">${esc(h.name)}${h.count ? ` <span class="n">×${h.count}</span>` : ''}</span>`, c.kind === 'class' ? 'Class component: no hooks.' : 'No hooks.')}
      ${(c.context || []).length ? `<div class="rel-group"><h3>Context</h3>${chips(c.context, (x) => `<span class="chip">${esc(x)}</span>`)}</div>` : ''}
      ${(c.refs || []).length ? `<div class="rel-group"><h3>Refs</h3>${chips(c.refs, (x) => `<span class="chip">${esc(x)}</span>`)}</div>` : ''}`;

    const relations = `
      <div class="rel-group"><h3>Rendered by</h3>${chips(c.usedBy, (x) => compChip(x), 'Not rendered by another project component.')}</div>
      <div class="rel-group"><h3>Renders</h3>${chips(c.renders, (x) => compChip(x), 'No project components.')}</div>
      <div class="rel-group"><h3>Library components</h3>${chips(c.externals, (x) => `<span class="chip ext">${esc(x)}</span>`, 'None.')}</div>
      <div class="rel-group"><h3>Appears on pages</h3>${chips(c.pages, pageChip, 'Not reachable from any page.')}</div>`;

    const usedBy = c.usedBy || [];
    const pages = c.pages || [];
    const cols = [
      { title: 'Pages', nodes: pages.map((r) => ({ key: 'p:' + r, label: r, cls: 'page', href: pageHref(r) })) },
      { title: 'Rendered by', nodes: usedBy.map((u) => ({ key: 'c:' + u, label: C[u]?.name || u, href: compHref(u) })) },
      { title: 'Component', nodes: [{ key: 'self', label: c.name, cls: 'focus' }] },
      { title: 'Renders', nodes: (c.renders || []).map((r) => ({ key: 'c:' + r, label: C[r]?.name || r, href: compHref(r) })) },
    ];
    const edges = [];
    for (const r of pages) {
      const viaParent = usedBy.filter((u) => (P[r].components || []).includes(u));
      if (viaParent.length && P[r].component !== id && !(P[r].layouts || []).includes(id)) viaParent.forEach((u) => edges.push({ from: 'p:' + r, to: 'c:' + u, dashed: P[r].component !== u && !(P[r].layouts || []).includes(u) }));
      else edges.push({ from: 'p:' + r, to: 'self', dashed: P[r].component !== id && !(P[r].layouts || []).includes(id) });
    }
    usedBy.forEach((u) => edges.push({ from: 'c:' + u, to: 'self' }));
    (c.renders || []).forEach((r) => edges.push({ from: 'self', to: 'c:' + r }));
    const connections = graphSVG(cols.filter((col) => col.nodes.length), edges, { inline: true });

    const editor = ROOT ? `<a class="btn" href="vscode://file/${esc(ROOT)}/${esc(c.file)}:${c.line || 1}">Open in VS Code</a>` : '';
    main.innerHTML = `
      <div class="page-head">
        <h1>${esc(c.name)} ${kindBadge(c)} ${c.export && c.export !== 'none' ? `<span class="badge">${esc(c.export)} export</span>` : ''} ${statusBadge(c)} ${(c.tags || []).map((t) => `<span class="badge">#${esc(t)}</span>`).join(' ')}</h1>
        <div class="file">${esc(c.file)}${c.line ? `:${c.line}` : ''}${c.owner ? ` · owner ${esc(c.owner)}` : ''}</div>
        ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
        <div class="actions"><button class="btn" id="show-source">View source</button>${editor}</div>
      </div>
      <div class="grid">
        ${card('Connections', connections + '<p class="small muted">Dashed: the page reaches this component through deeper descendants.</p>', { wide: true })}
        ${card('Props', propsTable, { count: props.length })}
        ${card('State', stateTable, { count: state.length })}
        ${card('Lifecycle', lifecycleView(c), { wide: true, count: (c.lifecycle || []).length })}
        ${card('Hooks', hooksBody, { count: hooks.length })}
        ${card('Relations', relations)}
        <section class="card wide" id="source-card" hidden><h2><span>Source</span><span class="count">${esc(c.file)}</span></h2><div id="source-body"></div></section>
      </div>`;
    $('#show-source').addEventListener('click', () => showSource(c));
  }

  async function showSource(c) {
    const cardEl = $('#source-card');
    const body = $('#source-body');
    cardEl.hidden = false;
    body.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const res = await fetch('api/source?file=' + encodeURIComponent(c.file));
      if (!res.ok) throw new Error();
      const lines = (await res.text()).split('\n');
      body.innerHTML = `<pre class="source">${lines.map((l, i) => `<span class="ln${i + 1 === c.line ? ' hl' : ''}" data-n="${i + 1}">${esc(l) || ' '}</span>`).join('')}</pre>`;
      const pre = body.querySelector('pre');
      const hl = body.querySelector('.hl');
      if (hl) pre.scrollTop = hl.offsetTop - 40;
    } catch {
      body.innerHTML = '<p class="none">Source is only available while running <code>rcat serve</code>.</p>';
    }
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function tree(id, ancestors, slot) {
    const c = C[id];
    if (!c) return `<li><span class="chip">${esc(id)}</span></li>`;
    if (ancestors.includes(id)) return `<li>${compChip(id)} <span class="cycle">↻ recursive</span></li>`;
    const next = [...ancestors, id];
    const children = (c.renders || []).map((r) => tree(r, next)).join('') + (slot ? `<li><span class="muted small">children →</span><ul>${slot}</ul></li>` : '');
    const summary = `${compChip(id)}${c.kind !== 'function' ? ' ' + kindBadge(c) : ''}${Object.keys(c.state || {}).length ? ` <span class="muted small">${Object.keys(c.state).length} state</span>` : ''}`;
    return children ? `<li><details open><summary>${summary}</summary><ul>${children}</ul></details></li>` : `<li>${summary}</li>`;
  }

  function viewPage(route) {
    const p = P[route];
    if (!p) return notFound(`Page “${route}”`);
    const chain = [...(p.layouts || []), p.component].filter(Boolean);
    let composition = '';
    for (let i = chain.length - 1; i >= 0; i--) composition = tree(chain[i], chain.slice(0, i), composition || undefined);
    const comps = (p.components || []).filter((id) => C[id]);
    main.innerHTML = `
      <div class="page-head">
        <h1><span class="mono">${esc(route)}</span> <span class="badge page">${esc(p.router)}</span> ${(p.tags || []).map((t) => `<span class="badge">#${esc(t)}</span>`).join(' ')}</h1>
        <div class="file">${esc(p.file)}</div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      </div>
      <div class="grid">
        ${card(
          'Route',
          `<table><tbody>
            <tr><td>Root component</td><td>${p.component ? compChip(p.component) : '<span class="none">unresolved</span>'}</td></tr>
            <tr><td>Layouts</td><td>${chips(p.layouts, (x) => compChip(x), 'None')}</td></tr>
            <tr><td>Params</td><td>${chips(p.params, (x) => `<span class="chip ext">${esc(x)}</span>`, 'Static route')}</td></tr>
          </tbody></table>`,
        )}
        ${card('Composition', composition ? `<ul class="tree">${composition}</ul>` : '<p class="none">No resolvable component tree.</p>')}
        ${card(
          'Components on this page',
          `<div class="table-wrap"><table><thead><tr><th>Component</th><th>Kind</th><th>State</th><th>Effects</th><th>File</th></tr></thead><tbody>${comps
            .map((id) => `<tr><td>${compChip(id)}</td><td>${esc(C[id].kind)}</td><td>${Object.keys(C[id].state || {}).length || ''}</td><td>${(C[id].lifecycle || []).length || ''}</td><td class="muted small mono">${esc(C[id].file)}</td></tr>`)
            .join('')}</tbody></table></div>`,
          { wide: true, count: comps.length },
        )}
        ${card('Render graph', layeredGraph([route], comps), { wide: true })}
      </div>`;
  }

  function notFound(what) {
    main.innerHTML = `<div class="page-head"><h1>Not found</h1><p class="muted">${esc(what)} is not in this catalogue. It may have been renamed; regenerate with <code>rcat generate</code>.</p><p><a href="#/">Back to overview</a></p></div>`;
  }

  // ---------- routing ----------
  function route() {
    const [, type, ...rest] = (location.hash.slice(1) || '/').split('/');
    const arg = decodeURIComponent(rest.join('/'));
    if (type === 'c') {
      if (ui.tab !== 'components') (ui.tab = 'components'), renderList();
      viewComponent(arg);
    } else if (type === 'p') {
      if (ui.tab !== 'pages') (ui.tab = 'pages'), renderList();
      viewPage(arg);
    } else if (type === 'graph') viewGraph();
    else viewOverview();
    wireGraphs();
    main.scrollTop = 0;
    document.body.classList.remove('nav-open');
    markActive();
  }

  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      ui.tab = b.dataset.tab;
      renderList();
    }),
  );
  $('#search').addEventListener('input', (e) => {
    ui.query = e.target.value;
    renderList();
  });
  $('#menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('#search')) {
      e.preventDefault();
      $('#search').focus();
    } else if (e.key === 'Escape' && document.activeElement === $('#search')) {
      $('#search').value = '';
      ui.query = '';
      renderList();
      $('#search').blur();
    }
  });
  window.addEventListener('hashchange', route);

  if (ROOT && 'EventSource' in window) new EventSource('api/events').onmessage = () => location.reload();

  renderList();
  route();
})();
