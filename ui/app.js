(() => {
  'use strict';
  const cat = window.__CATALOGUE__;
  const ROOT = window.__CATALOGUE_ROOT__;
  const LIVE = window.__CATALOGUE_LIVE__;
  const PREVIEW = window.__CATALOGUE_PREVIEW__;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const main = $('#main');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
  const len = (x) => (Array.isArray(x) ? x.length : x ? Object.keys(x).length : 0);

  if (!cat) {
    main.innerHTML = '<p>No catalogue data found. Run <code>frontdex scan</code> and reload.</p>';
    return;
  }

  // ---------- icons ----------
  const ICONS = {
    logo: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z"/><circle cx="16.5" cy="16.5" r="3.5"/>',
    page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    cube: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    classbox: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M15 9.5a3.5 3.5 0 1 0 0 5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    propIn: '<path d="M2 12h12"/><path d="m10 8 4 4-4 4"/><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>',
    propOut: '<path d="M10 12h12"/><path d="m18 8 4 4-4 4"/><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>',
    fn: '<path d="M9.5 20c1.8 0 2.7-1.2 3.1-3.6L14 7.6C14.4 5.2 15.3 4 17.1 4"/><path d="M8 11h8"/>',
    variable: '<path d="M8 4c-2.5 3-2.5 13 0 16M16 4c2.5 3 2.5 13 0 16"/><path d="m10 9 4 6M14 9l-4 6"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
    swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.6 5.6 0 0 0 22 10c0-4.4-4.5-8-10-8z"/>',
    droplet: '<path d="M12 2.7s-6.5 6.6-6.5 11.6a6.5 6.5 0 0 0 13 0c0-5-6.5-11.6-6.5-11.6z"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    graph: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M6.2 8.2l4.6 7.6M17.8 8.2l-4.6 7.6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    siblings: '<path d="M7 4 3 8l4 4M17 12l4 4-4 4M3 8h18M21 16H3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    anchor: '<circle cx="12" cy="5" r="3"/><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3"/>',
    pin: '<path d="M12 17v5M9 10.8V4h6v6.8l3 3.2H6z"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    cycle: '<path d="M21 2v6h-6M3 22v-6h6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16"/>',
    flow: '<circle cx="5" cy="6" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="12" r="3"/><path d="M8 6h3a5 5 0 0 1 5 5M8 18h3a5 5 0 0 0 5-5"/>',
    family: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.1a3 3 0 0 1 0 5.8M21 21v-2a4 4 0 0 0-3-3.9"/>',
    sitemap: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    dot: '<circle cx="12" cy="12" r="3"/>',
  };
  const I = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;
  const ico = (kind, icon, size = '') => `<span class="ico ${size} k-${kind}">${I(icon)}</span>`;

  // ---------- persistence & theme ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('rcat:' + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('rcat:' + k, JSON.stringify(v));
      } catch {}
    },
  };
  const applyTheme = (t) => (t ? (document.documentElement.dataset.theme = t) : delete document.documentElement.dataset.theme);
  applyTheme(store.get('theme'));

  // ---------- model ----------
  const C = cat.components || {};
  const P = cat.pages || {};
  const STORES = cat.stores || {};
  const HEALTH = cat.health || {};
  const info = cat.info || {};
  const { LEVELS, QUERY_HELP } = window.CatalogueQuery;
  const idx = window.CatalogueQuery.createIndex(cat);
  const { comps, byId, nameCount, pageRoots, layoutIds } = idx;
  const ROUTES = Object.keys(P).sort(natural);
  const SEV_ORDER = ['high', 'medium', 'low', 'info'];
  const dirOf = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');
  const baseName = (f) => f.slice(f.lastIndexOf('/') + 1);
  const worstOf = (issues) => SEV_ORDER.find((s) => (issues || []).some((i) => i.severity === s));
  const pageIssues = (route) => (P[route].components || []).flatMap((id) => (C[id]?.issues || []).map((i) => ({ ...i, id })));
  const nm = (id) => C[id]?.name ?? id;

  const ENDPOINTS = new Map();
  for (const m of comps) for (const a of m.c.apiCalls || []) {
    const key = `${a.method} ${a.target ?? '?'}`;
    (ENDPOINTS.get(key) || ENDPOINTS.set(key, { method: a.method, target: a.target, users: [] }).get(key)).users.push({ id: m.id, ...a });
  }

  // ---------- hrefs ----------
  const enc = encodeURIComponent;
  const qs = (params) => {
    const s = Object.entries(params || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${enc(v)}`).join('&');
    return s ? `?${s}` : '';
  };
  const compHref = (id, params) => `#/c/${enc(id)}${qs(params)}`;
  const pageHref = (r, params) => `#/p/${enc(r)}${qs(params)}`;
  const dirHref = (p, q) => `#/f/${p.split('/').map(enc).join('/')}${qs({ q })}`;
  const storeHref = (id) => `#/state${qs({ store: id })}`;
  const healthHref = (params) => `#/health${qs(params)}`;

  // ---------- small renderers ----------
  const roleOf = (id) => (pageRoots.has(id) ? 'page' : layoutIds.has(id) ? 'layout' : C[id]?.kind || 'function');
  const compIco = (id, size = 'sm') => {
    const role = roleOf(id);
    return role === 'page' ? ico('page', 'page', size) : role === 'layout' ? ico('layout', 'layout', size) : ico(role, role === 'class' ? 'classbox' : 'cube', size);
  };
  const compChip = (id, params) =>
    C[id] ? `<a class="chip${C[id].issues?.some((i) => i.severity === 'high') ? ' warn' : ''}" href="${compHref(id, params)}" title="${esc(C[id].file)}">${compIco(id)}${esc(C[id].name)}${nameCount.get(C[id].name) > 1 ? ` <span class="n">${esc(dirOf(C[id].file))}</span>` : ''}</a>` : `<span class="chip plain">${esc(id)}</span>`;
  const pageChip = (r) => `<a class="chip mono" href="${pageHref(r)}">${ico('route', 'globe', 'sm')}${esc(r)}</a>`;
  const storeIconOf = (s) => (s.kind === 'context' ? ['context', 'share'] : ['store', 'layers']);
  const storeChip = (sid) => {
    const s = STORES[sid];
    if (!s) return `<span class="chip plain">${esc(sid)}</span>`;
    const [k, i] = storeIconOf(s);
    return `<a class="chip" href="${storeHref(sid)}">${ico(k, i, 'sm')}${esc(s.name)} <span class="n">${esc(s.kind.replace('redux-slice', 'redux'))}</span></a>`;
  };
  const chips = (items, fn, empty = 'None') => (items && items.length ? `<div class="chips">${items.map(fn).join('')}</div>` : `<p class="none">${empty}</p>`);
  const fileRef = (file, line) => (file ? `<button class="fileref" data-src="${esc(file)}" data-line="${line || ''}" title="Open source">${I('code', 'sm')}${esc(file)}${line ? `:${line}` : ''}</button>` : '');
  const lineRef = (file, line) => (line ? `<button class="fileref" data-src="${esc(file)}" data-line="${line}">L${line}</button>` : '');
  const sevBadge = (s) => `<span class="badge sev-${s}">${s}</span>`;
  const methodBadge = (m) => `<span class="method ${esc(m)}">${esc(m)}</span>`;
  const card = (title, icon, body, { wide, count, sub, id } = {}) =>
    `<section class="card${wide ? ' wide' : ''}"${id ? ` id="${id}"` : ''}><div class="card-h">${icon || ''}<h3>${title}</h3>${count != null ? `<span class="count">${count}</span>` : ''}</div>${sub ? `<p class="card-sub">${sub}</p>` : ''}${body}</section>`;
  const mini = (k, icon, n, title) => (n ? `<span class="mini k-${k}" title="${esc(title)}">${I(icon, 'sm')}${n}</span>` : '');
  const compMinis = (c) =>
    mini('state', 'database', len(c.state), 'state') +
    mini('effect', 'zap', len(c.lifecycle), 'effects / lifecycle') +
    mini('timer', 'timer', len(c.timers), 'timers & listeners') +
    mini('api', 'swap', len(c.apiCalls), 'API calls') +
    mini('store', 'layers', len(c.store?.reads) + len(c.store?.writes), 'global state') +
    mini('issue', 'alert', len(c.issues), 'issues');

  function crumbs(parts) {
    return `<nav class="crumbs">${parts.map((p, i) => (i === parts.length - 1 ? `<span class="here">${p.html}</span>` : `<a href="${p.href}">${p.html}</a><span class="sep">${I('chev', 'sm')}</span>`)).join('')}</nav>`;
  }

  // ---------- source panel ----------
  const sourceCache = new Map();
  async function loadSource(file) {
    if (!sourceCache.has(file)) {
      sourceCache.set(
        file,
        fetch('api/source?file=' + enc(file)).then((r) => {
          if (!r.ok) throw new Error();
          return r.text();
        }),
      );
    }
    return sourceCache.get(file);
  }
  const sourceHtml = (text, line) => `<pre class="source">${text.split('\n').map((l, i) => `<span class="ln${i + 1 === Number(line) ? ' hl' : ''}" data-n="${i + 1}">${esc(l) || ' '}</span>`).join('')}</pre>`;
  async function openSource(file, line) {
    const panel = $('#source-panel');
    panel.hidden = false;
    $('#sp-title').textContent = `${file}${line ? `:${line}` : ''}`;
    $('#sp-actions').innerHTML = `${ROOT ? `<a class="btn btn-sm" href="vscode://file/${esc(ROOT)}/${esc(file)}${line ? `:${line}` : ''}">${I('external', 'sm')} VS Code</a>` : ''}<button class="icon-btn" id="sp-close" aria-label="Close">${I('x')}</button>`;
    $('#sp-close').onclick = () => (panel.hidden = true);
    const body = $('#sp-body');
    body.innerHTML = '<p class="none" style="padding:16px">Loading…</p>';
    try {
      body.innerHTML = sourceHtml(await loadSource(file), line);
      const hl = $('.hl', body);
      if (hl) body.scrollTop = hl.offsetTop - 120;
    } catch {
      body.innerHTML = `<p class="none" style="padding:16px">Source is available while running <code>frontdex serve</code>.${ROOT ? '' : ' This is a static export.'}</p>`;
    }
  }
  document.addEventListener('click', (e) => {
    const ref = e.target.closest('[data-src]');
    if (ref) {
      e.preventDefault();
      openSource(ref.dataset.src, ref.dataset.line);
    }
  });

  // ---------- trails: page → layout chain → … → component ----------
  function pageChildren(id, slot) {
    return [...(C[id]?.renders || []), ...(slot.length ? [slot[0]] : [])];
  }
  function trailsTo(target, limit = 24) {
    const out = [];
    for (const route of ROUTES) {
      if (!(P[route].components || []).includes(target)) continue;
      const chain = [...(P[route].layouts || []), P[route].component].filter(Boolean);
      const walk = (id, path, slot) => {
        if (out.length >= limit || path.includes(id) || path.length > 16) return;
        const next = [...path, id];
        if (id === target) return void out.push({ route, path: next });
        const kids = pageChildren(id, slot);
        kids.forEach((k, i) => walk(k, next, i === kids.length - 1 && slot.length && k === slot[0] ? slot.slice(1) : []));
      };
      if (chain.length) walk(chain[0], [], chain.slice(1));
    }
    return out;
  }
  const trailParam = (t) => [t.route, ...t.path].join('>');
  const parseTrail = (s) => {
    if (!s) return null;
    const [route, ...path] = s.split('>');
    return P[route] && path.every((id) => C[id]) ? { route, path } : null;
  };
  function trailCrumbs(t) {
    if (!t) return '';
    const parts = [{ href: pageHref(t.route), html: `${I('globe', 'sm')}<span class="mono">${esc(t.route)}</span>` }];
    t.path.forEach((id, i) => parts.push({ href: compHref(id, { trail: trailParam({ route: t.route, path: t.path.slice(0, i + 1) }) }), html: `${compIco(id)}${esc(nm(id))}` }));
    return crumbs(parts);
  }

  // ---------- sidebar ----------
  const side = { tab: store.get('side', 'pages'), filter: '', open: new Set(store.get('open2', [])) };
  const saveOpen = () => store.set('open2', [...side.open].slice(-400));
  let current = { type: '', id: '', trail: null };

  const GROUPS = [
    ['state', 'State', 'state', 'database', (c) => Object.entries(c.state || {}).map(([n, s]) => ({ label: n, sub: s.initial, focus: `state:${n}`, tab: 'internals' }))],
    ['props', 'Props', 'prop', 'propIn', (c) => Object.entries(c.props || {}).map(([n, p]) => ({ label: n, sub: p.type, focus: `prop:${n}`, tab: 'internals' }))],
    ['functions', 'Functions', 'fn', 'fn', (c) => (c.functions || []).map((f) => ({ label: `${f.name}()`, line: f.line, focus: `fn:${f.name}`, tab: 'internals', bad: f.used === false }))],
    ['variables', 'Variables', 'var', 'variable', (c) => (c.variables || []).map((v) => ({ label: v.name, line: v.line, focus: `var:${v.name}`, tab: 'internals', bad: v.used === false }))],
    ['effects', 'Effects', 'effect', 'zap', (c) => (c.lifecycle || []).map((e) => ({ label: e.via, line: e.line, sub: e.deps ? `[${e.deps.join(', ')}]` : '', tab: 'lifecycle' }))],
    ['timers', 'Timers & listeners', 'timer', 'timer', (c) => (c.timers || []).map((t) => ({ label: t.call, line: t.line, sub: t.cleared === false ? 'not released' : '', tab: 'lifecycle', bad: t.cleared === false }))],
    ['api', 'API calls', 'api', 'swap', (c) => (c.apiCalls || []).map((a) => ({ label: `${a.method} ${a.target ?? ''}`, line: a.line, tab: 'data' }))],
    ['store', 'Global state', 'store', 'layers', (c) => [...(c.store?.reads || []).map((r) => ({ label: `${r.storeId?.split(':')[1] ?? r.store ?? r.kind}${r.path ? `.${r.path.replace(/^[^.]+\.?/, '')}` : ''}`, sub: 'read', tab: 'data' })), ...(c.store?.writes || []).map((w) => ({ label: w.action, sub: 'write', tab: 'data' }))]],
    ['validation', 'Validation', 'valid', 'shield', (c) => (c.validation || []).map((v) => ({ label: v.schema ?? v.field ?? v.fn ?? v.via, sub: v.via, line: v.line, tab: 'data' }))],
    ['issues', 'Issues', 'issue', 'alert', (c) => (c.issues || []).map((i) => ({ label: i.type, line: i.line, sub: i.severity, tab: 'health', bad: i.severity === 'high' }))],
  ];

  function treeRow({ key, depth, icon, label, meta = '', nav, toggle, open, cls = '', dataId = '', title = '' }) {
    return `<div class="tn ${cls}" style="--d:${depth}" ${nav ? `data-nav="${esc(nav)}"` : ''} ${dataId ? `data-id="${esc(dataId)}"` : ''} ${title ? `title="${esc(title)}"` : ''}><span class="caret${toggle ? (open ? ' open' : '') : ' empty'}" ${toggle ? `data-toggle="${esc(key)}"` : ''}>${I('chev', 'sm')}</span>${icon}<span class="tn-label">${label}</span>${meta}</div>`;
  }

  function compTree(id, route, path, slot, depth) {
    const c = C[id];
    if (!c) return '';
    const key = `${route}>${[...path, id].join('>')}`;
    if (path.includes(id) || depth > 18) return treeRow({ key, depth, icon: compIco(id), label: `${esc(c.name)} <span class="muted small">↻</span>` });
    const trail = { route, path: [...path, id] };
    const kids = pageChildren(id, slot);
    const groups = GROUPS.map(([g, label, k, icon, fn]) => [g, label, k, icon, fn(c)]).filter((x) => x[4].length);
    const open = side.open.has(key);
    const worst = worstOf(c.issues);
    let html = treeRow({ key, depth, icon: compIco(id), label: esc(c.name), meta: `<span class="tn-meta">${worst ? `<span class="dot ${worst}" title="${len(c.issues)} issue(s)"></span>` : ''}</span>`, nav: compHref(id, { trail: trailParam(trail) }), toggle: kids.length || groups.length, open, dataId: id, title: c.file });
    if (!open) return html;
    for (const [g, label, k, icon, items] of groups) {
      const gk = `${key}#${g}`;
      const gopen = side.open.has(gk);
      html += treeRow({ key: gk, depth: depth + 1, icon: ico(k, icon, 'sm'), label: esc(label), meta: `<span class="tn-meta">${items.length}</span>`, toggle: true, open: gopen, cls: 'group' });
      if (gopen) {
        html += items
          .map((it) => treeRow({ key: '', depth: depth + 2, icon: '', label: `<code>${esc(it.label)}</code>${it.sub ? ` <span class="muted small">${esc(String(it.sub).slice(0, 28))}</span>` : ''}${it.bad ? ' <span class="dot high"></span>' : ''}`, meta: it.line ? `<span class="line">L${it.line}</span>` : '', nav: compHref(id, { tab: it.tab, focus: it.focus, trail: trailParam(trail) }), cls: 'item' }))
          .join('');
      }
    }
    kids.forEach((k, i) => (html += compTree(k, route, [...path, id], i === kids.length - 1 && slot.length && k === slot[0] ? slot.slice(1) : [], depth + 1)));
    return html;
  }

  function renderPagesTree() {
    const q = side.filter.trim().toLowerCase();
    if (q) {
      const routes = ROUTES.filter((r) => r.toLowerCase().includes(q));
      const hits = idx.run(side.filter).slice(0, 120);
      return (
        routes.map((r) => treeRow({ key: '', depth: 0, icon: ico('route', 'globe', 'sm'), label: esc(r), nav: pageHref(r), cls: 'rt' })).join('') +
        hits.map((m) => treeRow({ key: '', depth: 0, icon: compIco(m.id), label: `${esc(m.name)} <span class="muted small">${esc(m.dir)}</span>`, nav: compHref(m.id), dataId: m.id })).join('') ||
        '<p class="none" style="padding:8px">No matches.</p>'
      );
    }
    return ROUTES.map((r) => {
      const key = `r:${r}`;
      const open = side.open.has(key);
      const issues = pageIssues(r);
      const worst = worstOf(issues);
      let html = treeRow({ key, depth: 0, icon: ico('route', 'globe', 'sm'), label: esc(r), meta: `<span class="tn-meta">${worst ? `<span class="dot ${worst}" title="${issues.length} issue(s) on this page"></span>` : ''}${len(P[r].components)}</span>`, nav: pageHref(r), toggle: true, open, cls: 'rt', dataId: `p:${r}` });
      if (open) {
        const chain = [...(P[r].layouts || []), P[r].component].filter(Boolean);
        if (chain.length) html += compTree(chain[0], r, [], chain.slice(1), 1);
      }
      return html;
    }).join('');
  }

  // folder tree (Files tab and the components explorer)
  const newDir = (name, path) => ({ name, path, dirs: new Map(), comps: [], all: [] });
  const tree = newDir('', '');
  for (const m of comps) {
    let node = tree;
    node.all.push(m);
    for (const seg of m.dir ? m.dir.split('/') : []) {
      if (!node.dirs.has(seg)) node.dirs.set(seg, newDir(seg, node.path ? `${node.path}/${seg}` : seg));
      node = node.dirs.get(seg);
      node.all.push(m);
    }
    node.comps.push(m);
  }
  (function compact(node) {
    for (const [key, child] of [...node.dirs]) {
      let ch = child;
      while (!ch.comps.length && ch.dirs.size === 1) {
        const [only] = ch.dirs.values();
        only.name = `${ch.name}/${only.name}`;
        ch = only;
      }
      if (ch !== child) {
        node.dirs.delete(key);
        node.dirs.set(ch.name, ch);
      }
      compact(ch);
    }
  })(tree);
  const dirIndex = new Map();
  (function index(node) {
    dirIndex.set(node.path, node);
    node.dirs.forEach(index);
  })(tree);
  const findDir = (path) => dirIndex.get(path) || [...dirIndex.values()].find((n) => n.path.startsWith(path + '/')) || tree;

  function renderFilesTree(node = tree, depth = 0) {
    const q = side.filter.trim();
    if (q && depth === 0) return idx.run(q).slice(0, 200).map((m) => treeRow({ key: '', depth: 0, icon: compIco(m.id), label: `${esc(m.name)} <span class="muted small">${esc(m.dir)}</span>`, nav: compHref(m.id), dataId: m.id })).join('') || '<p class="none" style="padding:8px">No matches.</p>';
    const dirs = [...node.dirs.values()].sort((a, b) => natural(a.name, b.name));
    return (
      dirs
        .map((d) => {
          const key = `d:${d.path}`;
          const open = side.open.has(key);
          return treeRow({ key, depth, icon: ico('folder', 'folder', 'sm'), label: esc(d.name), meta: `<span class="tn-meta">${d.all.length}</span>`, nav: dirHref(d.path), toggle: true, open, dataId: `f:${d.path}` }) + (open ? renderFilesTree(d, depth + 1) : '');
        })
        .join('') +
      [...node.comps]
        .sort((a, b) => natural(a.name, b.name))
        .map((m) => treeRow({ key: '', depth, icon: compIco(m.id), label: esc(m.name), meta: m.worst ? `<span class="tn-meta"><span class="dot ${m.worst}"></span></span>` : '', nav: compHref(m.id), dataId: m.id, title: m.c.file }))
        .join('')
    );
  }

  function renderTree() {
    $$('.side-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.side === side.tab));
    $('#tree-filter').placeholder = side.tab === 'pages' ? 'Filter routes & components…' : 'Filter components…';
    $('#tree').innerHTML = side.tab === 'pages' ? renderPagesTree() : renderFilesTree();
    markTree();
  }
  function markTree() {
    const active = current.type === 'c' ? current.id : current.type === 'p' ? `p:${current.id}` : current.type === 'f' ? `f:${current.id}` : null;
    let first = null;
    $$('#tree [data-id]').forEach((n) => {
      const on = n.dataset.id === active;
      n.classList.toggle('active', on);
      if (on && !first) first = n;
    });
    first?.scrollIntoView({ block: 'nearest' });
  }
  function revealTrail(t) {
    if (!t) return;
    side.open.add(`r:${t.route}`);
    for (let i = 1; i < t.path.length; i++) side.open.add(`${t.route}>${t.path.slice(0, i).join('>')}`);
    saveOpen();
  }
  $('#tree').addEventListener('click', (e) => {
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const k = tog.dataset.toggle;
      side.open.has(k) ? side.open.delete(k) : side.open.add(k);
      saveOpen();
      renderTree();
      return;
    }
    const row = e.target.closest('[data-nav]');
    if (row) {
      const toggleKey = $('[data-toggle]', row)?.dataset.toggle;
      if (toggleKey) side.open.add(toggleKey), saveOpen();
      location.hash = row.dataset.nav;
    }
  });
  $$('.side-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      side.tab = b.dataset.side;
      store.set('side', side.tab);
      renderTree();
    }),
  );
  let treeTimer;
  $('#tree-filter').addEventListener('input', (e) => {
    clearTimeout(treeTimer);
    treeTimer = setTimeout(() => ((side.filter = e.target.value), renderTree()), 70);
  });

  // ---------- view: site map ----------
  const ACTIONS = [
    ['memory-leak', 'high', 'droplet', 'Fix memory leaks', 'Intervals, listeners, subscriptions or observers that are never released.'],
    ['render-loop', 'high', 'cycle', 'Break infinite render loops', 'Effects with no dependency array that set state every render.'],
    ['side-effect-in-render', 'high', 'zap', 'Move side effects out of render', 'Timers or listeners started directly while rendering.'],
    ['unsafe-async-update', 'medium', 'timer', 'Guard async state updates', 'State set after a request with no abort or ignore flag.'],
    ['deprecated-usage', 'medium', 'alert', 'Replace deprecated components', 'Components still rendering something marked @deprecated.'],
    ['missing-dependency', 'low', 'zap', 'Review stale effect dependencies', 'Effects that read values missing from their dependency array.'],
    ['unused-prop', 'low', 'propIn', 'Remove unused props', 'Props destructured but never used.'],
    ['unused-variable', 'low', 'variable', 'Remove unused variables', 'Locals declared inside components but never read.'],
    ['unused-function', 'low', 'fn', 'Remove unused functions', 'Handlers and helpers that are never called.'],
    ['unused-state', 'low', 'database', 'Remove unread state', 'State that is set but never read.'],
    ['state-never-updated', 'info', 'database', 'Turn constant state into constants', 'State whose setter is never called.'],
  ];

  function actionCenter() {
    const byType = HEALTH.byType || {};
    const rows = ACTIONS.filter(([t]) => byType[t]).map(([t, sev, icon, title, d]) => `<a class="action" href="${healthHref({ type: t })}"><span class="ico k-issue sev-icon ${sev}" style="--fg:var(--${sev === 'high' ? 'danger' : sev === 'medium' ? 'warn' : sev === 'low' ? 'info' : 'muted'})">${I(icon)}</span><span><div class="t">${title} <span class="badge sev-${sev}">${byType[t]}</span></div><div class="d">${d}</div></span><span class="go">Review ${I('arrowRight', 'sm')}</span></a>`);
    const dead = [
      [HEALTH.unusedComponents?.length, 'Delete unused components', 'Not rendered by anything and not on any page.'],
      [HEALTH.unusedFiles?.length, 'Delete unused files', 'Modules nothing imports.'],
      [HEALTH.unusedExports?.length, 'Prune exports nobody imports', 'Exported but never imported elsewhere.'],
      [HEALTH.unusedImports?.length, 'Remove unused imports', 'Imported but never referenced.'],
    ]
      .filter(([n]) => n)
      .map(([n, title, d]) => `<a class="action" href="${healthHref({ type: 'dead-code' })}"><span class="ico k-issue">${I('trash')}</span><span><div class="t">${title} <span class="badge sev-low">${n}</span></div><div class="d">${d}</div></span><span class="go">Review ${I('arrowRight', 'sm')}</span></a>`);
    const all = [...rows, ...dead];
    return all.length ? `<div class="actions-list">${all.join('')}</div>` : `<div class="all-good">${I('check')} Nothing to fix: no leaks, loops or dead code found.</div>`;
  }

  function viewSiteMap() {
    const issueCount = Object.values(HEALTH.issues || {}).reduce((a, b) => a + b, 0);
    const stat = (href, k, icon, v, label) => `<a class="stat" href="${href}">${ico(k, icon, 'lg')}<div><div class="v">${v}</div><div class="k">${label}</div></div></a>`;
    main.innerHTML = `
      <div class="vh"><div><h1>${esc(info.title || 'Catalogue')}</h1><div class="sub">${[info.version && `v${esc(info.version)}`, esc(info.framework || ''), (info.routers || []).map(esc).join(', '), info.generatedAt && `scanned ${new Date(info.generatedAt).toLocaleString()}`].filter(Boolean).join(' · ')}</div>${info.description ? `<p class="desc">${esc(info.description)}</p>` : ''}</div></div>
      <div class="stats">
        ${stat('#/', 'page', 'globe', ROUTES.length, 'pages / routes')}
        ${stat('#/components', 'comp', 'cube', comps.length, 'components')}
        ${stat('#/state', 'store', 'layers', len(STORES), 'global stores')}
        ${stat('#/health?view=api', 'api', 'swap', ENDPOINTS.size, 'API endpoints')}
        ${stat('#/health', 'issue', 'pulse', issueCount, 'issues to review')}
      </div>
      <div class="grid" style="margin-bottom:24px">
        ${card('What to do next', ico('issue', 'pulse'), actionCenter(), { sub: 'Findings from the last scan, most severe first. Each opens the exact files and lines.' })}
        ${card('Global state', ico('store', 'layers'), Object.keys(STORES).length ? `<div class="table-wrap"><table><thead><tr><th>Store</th><th>Readers</th><th>Writers</th></tr></thead><tbody>${Object.entries(STORES).map(([sid, s]) => `<tr><td>${storeChip(sid)}</td><td>${s.readers.length}</td><td>${s.writers.length}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No Redux slices, contexts or zustand stores detected.</p>', { count: len(STORES) })}
      </div>
      <section class="section"><div class="section-h">${ico('route', 'sitemap')}<h2>URL map</h2><span class="count">${ROUTES.length} routes · which components render on each URL</span></div>
        <div class="routes">${ROUTES.map(routeRow).join('') || '<p class="none">No routes detected.</p>'}</div></section>`;
  }

  function routeRow(r) {
    const p = P[r];
    const list = (p.components || []).filter((id) => C[id]);
    const api = list.reduce((n, id) => n + len(C[id].apiCalls), 0);
    const st = list.reduce((n, id) => n + len(C[id].store?.reads) + len(C[id].store?.writes), 0);
    const issues = pageIssues(r);
    const chain = [...(p.layouts || []), p.component].filter(Boolean);
    return `<div class="route">
      <div class="route-url">${ico('route', 'globe')}<div style="min-width:0"><a href="${pageHref(r)}">${esc(r)}</a><div class="small muted">${esc(p.router)} · ${fileRef(p.file)}</div></div></div>
      <div class="route-chain">${chain.map((id, i) => `${i ? `<span class="arrow">${I('chev', 'sm')}</span>` : ''}${compChip(id)}`).join('')}</div>
      <div class="route-stats"><span title="components">${I('cube', 'sm')}${list.length}</span><span title="API calls">${I('swap', 'sm')}${api}</span><span title="global state reads/writes">${I('layers', 'sm')}${st}</span>${issues.length ? `<span title="issues" style="color:var(--${worstOf(issues) === 'high' ? 'danger' : 'warn'})">${I('alert', 'sm')}${issues.length}</span>` : ''}<a class="btn btn-sm" href="${pageHref(r, { tab: 'preview' })}">${I('eye', 'sm')} Preview</a></div>
    </div>`;
  }

  // ---------- view: page ----------
  const PAGE_TABS = [
    ['structure', 'Structure', 'sitemap'],
    ['data', 'Data & APIs', 'swap'],
    ['preview', 'Preview', 'eye'],
    ['health', 'Health', 'pulse'],
    ['graph', 'Graph', 'graph'],
  ];

  function structureTree(route) {
    const p = P[route];
    const chain = [...(p.layouts || []), p.component].filter(Boolean);
    const rows = [];
    const walk = (id, path, slot, depth, passed) => {
      if (rows.length > 500) return;
      const c = C[id];
      if (!c) return;
      if (path.includes(id)) return void rows.push(`<div class="ct-row" style="--d:${depth}"><div class="ct-main">${compIco(id)}<span>${esc(c.name)}</span><span class="muted small">↻ recursive</span></div></div>`);
      const trail = trailParam({ route, path: [...path, id] });
      rows.push(`<div class="ct-row${depth ? '' : ' root'}" style="--d:${depth}"><div class="ct-main">${compIco(id)}<a href="${compHref(id, { trail })}">${esc(c.name)}</a>${roleOf(id) === 'layout' ? '<span class="badge k-layout">layout</span>' : roleOf(id) === 'page' ? '<span class="badge k-page">page</span>' : ''}${passed?.length ? `<span class="ct-props" title="${esc(passed.map((x) => `${x.name}=${x.value}`).join(', '))}">${esc(passed.map((x) => x.name).join(', '))}</span>` : ''}</div><div class="ct-badges">${compMinis(c)}</div></div>`);
      const kids = pageChildren(id, slot);
      kids.forEach((k, i) => {
        const isSlot = i === kids.length - 1 && slot.length && k === slot[0];
        if (isSlot) rows.push(`<div class="ct-row" style="--d:${depth + 1};--guide:none"><span class="slot-label">{children} →</span></div>`);
        walk(k, [...path, id], isSlot ? slot.slice(1) : [], depth + 1, isSlot ? null : [...new Map((c.passes?.[k] || []).map((x) => [x.name, x])).values()]);
      });
    };
    if (chain.length) walk(chain[0], [], chain.slice(1), 0, null);
    return `<div class="ctree">${rows.join('')}</div>`;
  }

  function pageData(route) {
    const list = (P[route].components || []).filter((id) => C[id]);
    const apis = list.flatMap((id) => (C[id].apiCalls || []).map((a) => ({ id, ...a })));
    const reads = new Map();
    const writes = new Map();
    for (const id of list) {
      for (const r of C[id].store?.reads || []) if (r.storeId) (reads.get(r.storeId) || reads.set(r.storeId, new Set()).get(r.storeId)).add(id);
      for (const w of C[id].store?.writes || []) if (w.storeId) (writes.get(w.storeId) || writes.set(w.storeId, new Set()).get(w.storeId)).add(id);
    }
    const storeIds = [...new Set([...reads.keys(), ...writes.keys()])];
    const forms = list.filter((id) => len(C[id].validation));
    return `<div class="grid">
      ${card('API calls on this page', ico('api', 'swap'), apis.length ? `<div class="table-wrap"><table><thead><tr><th>Method</th><th>Endpoint</th><th>Component</th><th>Runs in</th></tr></thead><tbody>${apis.map((a) => `<tr><td>${methodBadge(a.method)}</td><td><code>${esc(a.target ?? '?')}</code><div class="small muted">${esc(a.via)}</div></td><td>${compChip(a.id)}</td><td class="small">${esc(a.in)} ${lineRef(C[a.id].file, a.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No API calls from components on this page.</p>', { wide: true, count: apis.length })}
      ${card('Global state used here', ico('store', 'layers'), storeIds.length ? `<div class="table-wrap"><table><thead><tr><th>Store</th><th>Read by</th><th>Written by</th></tr></thead><tbody>${storeIds.map((sid) => `<tr><td>${storeChip(sid)}</td><td>${chips([...(reads.get(sid) || [])], (x) => compChip(x), '—')}</td><td>${chips([...(writes.get(sid) || [])], (x) => compChip(x), '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No global state on this page.</p>', { count: storeIds.length })}
      ${card('Forms & validation', ico('valid', 'shield'), forms.length ? forms.map((id) => `<div style="margin-bottom:10px">${compChip(id)} ${chips(C[id].validation, (v) => `<span class="chip plain">${esc(v.via)}: ${esc(v.schema ?? v.field ?? v.fn ?? '')}</span>`)}</div>`).join('') : '<p class="none">No validation on this page.</p>', { count: forms.length })}
    </div>`;
  }

  function pagePreview(route, params) {
    if (!PREVIEW) return '<p class="none">Set <code>"preview": "http://localhost:3000"</code> in frontdex.config.json to see the rendered page here.</p>';
    const dyn = [...route.matchAll(/\[\[?(?:\.\.\.)?(\w+)\]\]?|:(\w+)/g)].map((m) => m[1] || m[2]);
    const values = Object.fromEntries(dyn.map((d) => [d, params.get(`param.${d}`) || '1']));
    const path = route.replace(/ \(.*\)$/, '').replace(/\[\[?(?:\.\.\.)?(\w+)\]\]?|:(\w+)/g, (_m, a, b) => enc(values[a || b])).replace(/\/\*$/, '/');
    const url = PREVIEW.replace(/\/$/, '') + (path || '/');
    const width = { mobile: '390px', tablet: '820px', desktop: '100%' }[params.get('device') || 'desktop'] || '100%';
    return `<div class="preview-bar">
        <div class="url-box">${I('globe', 'sm')}<b>${esc(url)}</b></div>
        ${dyn.map((d) => `<label class="small muted">${esc(d)} <input class="param-input" data-param="${esc(d)}" value="${esc(values[d])}"></label>`).join('')}
        <div class="seg">${[['mobile', 'phone'], ['tablet', 'tablet'], ['desktop', 'monitor']].map(([d, i]) => `<button data-device="${d}" class="${(params.get('device') || 'desktop') === d ? 'on' : ''}" title="${d}">${I(i, 'sm')}</button>`).join('')}</div>
        <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${I('external', 'sm')} Open</a>
      </div>
      <div class="frame-wrap"><iframe src="${esc(url)}" style="width:${width}" title="Preview of ${esc(route)}"></iframe></div>
      <p class="preview-hint">Live view of your running app (${esc(PREVIEW)}). Start it with your dev command if the frame is empty; change the URL with <code>"preview"</code> in frontdex.config.json.</p>`;
  }

  const ISSUE_CAP = 200;
  function issueList(rows, withComp = true) {
    if (!rows.length) return `<div class="all-good">${I('check')} No issues found.</div>`;
    const more = rows.length > ISSUE_CAP ? `<p class="small muted" style="margin-top:12px">Showing the ${ISSUE_CAP} most severe of ${rows.length}. Filter by type or severity above to see the rest.</p>` : '';
    return rows
      .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
      .slice(0, ISSUE_CAP)
      .map(
        (i) => `<div class="issue ${i.severity}"><span class="sev-icon ${i.severity}">${I(i.type === 'memory-leak' ? 'droplet' : i.type === 'render-loop' ? 'cycle' : i.type.startsWith('unused') ? 'trash' : 'alert', 'lg')}</span><div>
          <div class="issue-h">${sevBadge(i.severity)}<span class="type">${esc(i.type.replace(/-/g, ' '))}</span>${withComp && i.id ? compChip(i.id) : ''}${i.id ? fileRef(C[i.id]?.file, i.line) : ''}</div>
          <p class="msg">${esc(i.message)}</p>${i.fix ? `<div class="fix">${I('check', 'sm')}<span>Fix: ${esc(i.fix)}</span></div>` : ''}</div></div>`,
      )
      .join('') + more;
  }

  function viewPage(route, tab, params) {
    const p = P[route];
    if (!p) return notFound(`Page “${route}”`);
    tab = PAGE_TABS.some(([k]) => k === tab) ? tab : 'structure';
    const list = (p.components || []).filter((id) => C[id]);
    const issues = pageIssues(route);
    const counts = {
      structure: list.length,
      data: list.reduce((n, id) => n + len(C[id].apiCalls), 0),
      health: issues.length,
    };
    main.innerHTML = `
      ${crumbs([{ href: '#/', html: `${I('sitemap', 'sm')}Site map` }, { html: `${I('globe', 'sm')}<span class="mono">${esc(route)}</span>` }])}
      <div class="vh"><div class="vh-title">${ico('route', 'globe', 'lg')}<div><h1><span class="mono">${esc(route)}</span><span class="badge k-page">${esc(p.router)}</span></h1>
        <div class="sub">${fileRef(p.file)}${p.component ? ` · renders ${compChip(p.component)}` : ''}${(p.layouts || []).length ? ` · inside ${(p.layouts || []).map((l) => compChip(l)).join(' ')}` : ''}</div></div></div>
        <div class="btn-row"><a class="btn" href="${pageHref(route, { tab: 'preview' })}">${I('eye', 'sm')} Preview</a><a class="btn" href="#/g?focus=${enc('p:' + route)}&depth=6">${I('graph', 'sm')} Graph</a></div></div>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      <div class="pills">
        <span class="pill">${ico('comp', 'cube', 'sm')}<b>${list.length}</b> components</span>
        <span class="pill">${ico('state', 'database', 'sm')}<b>${list.reduce((n, id) => n + len(C[id].state), 0)}</b> state</span>
        <span class="pill">${ico('api', 'swap', 'sm')}<b>${counts.data}</b> API calls</span>
        <span class="pill">${ico('store', 'layers', 'sm')}<b>${new Set(list.flatMap((id) => [...(C[id].store?.reads || []), ...(C[id].store?.writes || [])].map((x) => x.storeId).filter(Boolean))).size}</b> stores</span>
        ${(p.params || []).map((x) => `<span class="pill">${ico('prop', 'propIn', 'sm')}param <b class="mono">${esc(x)}</b></span>`).join('')}
        ${issues.length ? `<a class="pill alert" href="${pageHref(route, { tab: 'health' })}">${ico('issue', 'alert', 'sm')}<b>${issues.length}</b> issues</a>` : ''}
      </div>
      <nav class="tabs">${PAGE_TABS.map(([k, label, icon]) => `<a href="${pageHref(route, { tab: k })}" class="${k === tab ? 'active' : ''}">${I(icon, 'sm')}${label}${counts[k] ? `<span class="n${k === 'health' && issues.some((i) => i.severity === 'high') ? ' alert' : ''}">${counts[k]}</span>` : ''}</a>`).join('')}</nav>
      <div id="tab-body"></div>`;
    const body = $('#tab-body');
    if (tab === 'structure') body.innerHTML = card('Component tree', ico('page', 'sitemap'), structureTree(route), { wide: true, sub: 'Layouts wrap the page; indented rows are rendered by the row above. Names next to a component are the props its parent passes.' });
    if (tab === 'data') body.innerHTML = pageData(route);
    if (tab === 'preview') {
      body.innerHTML = pagePreview(route, params);
      $$('[data-device]', body).forEach((b) => b.addEventListener('click', () => (location.hash = pageHref(route, { ...Object.fromEntries(params), tab: 'preview', device: b.dataset.device }))));
      $$('[data-param]', body).forEach((inp) => inp.addEventListener('change', () => (location.hash = pageHref(route, { ...Object.fromEntries(params), tab: 'preview', [`param.${inp.dataset.param}`]: inp.value }))));
    }
    if (tab === 'health') body.innerHTML = card('Issues on this page', ico('issue', 'pulse'), issueList(issues), { wide: true, count: issues.length });
    if (tab === 'graph') body.innerHTML = graphFor({ focus: 'p:' + route, depth: 8, down: true });
  }

  // ---------- view: component ----------
  const COMP_TABS = [
    ['overview', 'Data flow', 'flow'],
    ['family', 'Family', 'family'],
    ['internals', 'Internals', 'variable'],
    ['lifecycle', 'Lifecycle', 'cycle'],
    ['data', 'API & state', 'swap'],
    ['styles', 'Styles', 'palette'],
    ['health', 'Health', 'pulse'],
    ['source', 'Source', 'code'],
    ['history', 'History', 'history'],
  ];

  function viewComponent(id, tab, params) {
    const m = byId.get(id);
    if (!m) return notFound(`Component “${id}”`);
    const c = m.c;
    tab = COMP_TABS.some(([k]) => k === tab) ? tab : store.get('ctab', 'overview');
    store.set('ctab', tab);
    const trails = trailsTo(id);
    const trail = parseTrail(params.get('trail')) || trails[0] || null;
    current.trail = trail;
    revealTrail(trail);
    const issues = c.issues || [];
    const counts = {
      family: len(c.usedBy) + len(c.renders),
      internals: len(c.state) + len(c.variables) + len(c.functions),
      lifecycle: len(c.lifecycle) + len(c.timers),
      data: len(c.apiCalls) + len(c.store?.reads) + len(c.store?.writes) + len(c.validation),
      styles: len(c.styles?.classes) + (c.styles?.modules || []).reduce((n, mo) => n + mo.classes.length, 0),
      health: issues.length,
      history: HISTORY ? historyFor(id).length : 0,
    };
    const keepTrail = trail ? trailParam(trail) : undefined;
    main.innerHTML = `
      ${trail ? trailCrumbs(trail) : crumbs([{ href: '#/components', html: `${I('grid', 'sm')}Components` }, { html: esc(c.name) }])}
      <div class="vh"><div class="vh-title">${compIco(id, 'lg')}<div>
        <h1>${esc(c.name)}<span class="badge k-${esc(c.kind)}">${esc(c.kind)}</span>${pageRoots.has(id) ? '<span class="badge k-page">page</span>' : ''}${layoutIds.has(id) ? '<span class="badge k-layout">layout</span>' : ''}${c.status ? `<span class="badge${c.status === 'deprecated' ? ' danger' : ''}">${esc(c.status)}</span>` : ''}${(c.tags || []).map((t) => `<span class="badge">#${esc(t)}</span>`).join('')}</h1>
        <div class="sub">${fileRef(c.file, c.line)}${c.export && c.export !== 'none' ? `<span>${esc(c.export)} export</span>` : ''}${c.owner ? `<span>owner ${esc(c.owner)}</span>` : ''}${trails.length > 1 ? `<a href="${compHref(id, { tab: 'family', trail: keepTrail })}">${I('family', 'sm')} ${trails.length} paths to this component</a>` : ''}</div>
      </div></div>
      <div class="btn-row">${ROOT ? `<a class="btn" href="vscode://file/${esc(ROOT)}/${esc(c.file)}:${c.line || 1}">${I('external', 'sm')} VS Code</a>` : ''}<a class="btn" href="#/g?focus=${enc('c:' + id)}">${I('graph', 'sm')} Graph</a></div></div>
      ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
      <div class="pills">
        <span class="pill">${ico('prop', 'propIn', 'sm')}<b>${m.props}</b> props</span>
        <span class="pill">${ico('state', 'database', 'sm')}<b>${m.state}</b> state</span>
        <span class="pill">${ico('effect', 'zap', 'sm')}<b>${m.effects}</b> effects</span>
        <span class="pill">${ico('timer', 'timer', 'sm')}<b>${len(c.timers)}</b> timers</span>
        <span class="pill">${ico('api', 'swap', 'sm')}<b>${len(c.apiCalls)}</b> API</span>
        <span class="pill">${ico('family', 'family', 'sm')}<b>${m.usedBy}</b> parents · <b>${m.renders}</b> children</span>
        <span class="pill">${ico('page', 'globe', 'sm')}<b>${m.pages}</b> pages</span>
        ${issues.length ? `<a class="pill alert" href="${compHref(id, { tab: 'health', trail: keepTrail })}">${ico('issue', 'alert', 'sm')}<b>${issues.length}</b> issues</a>` : ''}
      </div>
      <nav class="tabs">${COMP_TABS.map(([k, label, icon]) => `<a href="${compHref(id, { tab: k, trail: keepTrail })}" class="${k === tab ? 'active' : ''}">${I(icon, 'sm')}${label}${counts[k] ? `<span class="n${k === 'health' && issues.some((i) => i.severity === 'high') ? ' alert' : ''}">${counts[k]}</span>` : ''}</a>`).join('')}</nav>
      <div id="tab-body"></div>`;
    const body = $('#tab-body');
    const render = {
      overview: () => dataFlow(m),
      family: () => family(m, trails, trail),
      internals: () => internals(m),
      lifecycle: () => lifecycleTab(m),
      data: () => dataTab(m),
      styles: () => stylesTab(m),
      health: () => card('Diagnostics', ico('issue', 'pulse'), issueList(issues.map((i) => ({ ...i, id })), false), { wide: true, count: issues.length }),
      history: () => componentHistory(id),
    }[tab];
    if (tab === 'source') {
      body.innerHTML = card(esc(c.file), ico('fn', 'code'), '<p class="none">Loading…</p>', { wide: true });
      loadSource(c.file)
        .then((t) => {
          $('.card', body).lastElementChild.outerHTML = `<div class="sp-body" style="max-height:640px;border-radius:8px;overflow:auto">${sourceHtml(t, c.line)}</div>`;
          const hl = $('.hl', body);
          if (hl) hl.parentElement.parentElement.scrollTop = hl.offsetTop - 80;
        })
        .catch(() => ($('.card', body).lastElementChild.outerHTML = '<p class="none">Source is available while running <code>frontdex serve</code>.</p>'));
    } else body.innerHTML = render();
    const focus = params.get('focus');
    if (focus) {
      const row = $(`[data-focus="${CSS.escape(focus)}"]`, body);
      if (row) {
        row.classList.add('focus');
        setTimeout(() => row.scrollIntoView({ block: 'center' }), 30);
      }
    }
  }

  // A parent may render the same child several times; show each prop/value pair once.
  const uniqPasses = (list) => [...new Map((list || []).map((x) => [`${x.name}=${x.value}`, x])).values()];
  /** Props merged by name across render sites; values that differ between sites are marked as varying. */
  const mergedPasses = (list) => {
    const byName = new Map();
    for (const x of list || []) {
      const cur = byName.get(x.name);
      if (!cur) byName.set(x.name, { ...x });
      else if (cur.value !== x.value) cur.varies = true;
    }
    return [...byName.values()];
  };
  const sites = (list) => [...groupBy(list || [], (x) => x.line)];
  const siteRows = (file, list) =>
    sites(list).map(([line, props]) => `<div class="kv" style="align-items:flex-start;margin-bottom:4px">${lineRef(file, line)}<span class="v" style="white-space:normal">${props.map((x) => `<b style="color:var(--text);font-weight:600">${esc(x.name)}</b>=${esc(x.value)}`).join(', ')}</span></div>`).join('');
  const groupBy = (arr, fn) => arr.reduce((m, x) => (m.get(fn(x)) || m.set(fn(x), []).get(fn(x))).push(x) && m, new Map());
  const kv = (k, v, extra = '') => `<div class="kv"><span class="k">${esc(k)}</span>${v != null && v !== '' ? `<span class="v" title="${esc(v)}">${esc(v)}</span>` : ''}${extra}</div>`;
  const node = (head, inner, cls = '') => `<div class="node ${cls}">${head ? `<div class="node-h">${head}</div>` : ''}${inner}</div>`;
  const lane = (title, icon, k, content) => `<div class="lane"><div class="lane-h">${ico(k, icon, 'sm')}${title}</div>${content}</div>`;

  function dataFlow(m) {
    const c = m.c;
    const id = m.id;
    const routes = Object.entries(P).filter(([, p]) => p.component === id || (p.layouts || []).includes(id)).map(([r]) => r);
    const inputs = [
      ...routes.map((r) => node(`${ico('route', 'globe', 'sm')}<a href="${pageHref(r)}" class="mono">${esc(r)}</a>`, P[r].params?.length ? P[r].params.map((x) => kv(x, 'route param')).join('') : '<div class="empty">route entry</div>')),
      ...(c.usedBy || []).map((pid) => node(`${compIco(pid)}<a href="${compHref(pid)}">${esc(nm(pid))}</a>`, uniqPasses(C[pid]?.passes?.[id]).map((x) => kv(x.name, x.value)).join('') || '<div class="empty">renders it without props</div>')),
      ...[...groupBy(c.store?.reads || [], (r) => r.storeId ?? r.store ?? r.kind)].map(([key, rs]) => node(`${ico(rs[0].kind === 'context' ? 'context' : 'store', rs[0].kind === 'context' ? 'share' : 'layers', 'sm')}${STORES[key] ? `<a href="${storeHref(key)}">${esc(STORES[key].name)}</a>` : esc(key)}`, rs.map((r) => kv(r.path || 'value', `via ${r.via}`)).join(''))),
    ];
    const core = node(
      `${compIco(id)}${esc(c.name)}`,
      `${Object.keys(c.props || {}).length ? `<div class="small muted" style="margin:4px 0 2px">Props</div>${Object.entries(c.props).map(([n, p]) => kv(n + (p.required ? '' : '?'), p.type + (p.default != null ? ` = ${p.default}` : ''))).join('')}` : ''}
       ${len(c.state) ? `<div class="small muted" style="margin:6px 0 2px">State</div>${Object.entries(c.state).map(([n, s]) => kv(n, `= ${s.initial ?? '?'}`)).join('')}` : ''}
       ${(c.variables || []).length ? `<div class="small muted" style="margin:6px 0 2px">Derived</div>${c.variables.slice(0, 8).map((v) => kv(v.name, v.value, v.used === false ? '<span class="tag-unused">unused</span>' : '')).join('')}` : ''}
       ${!len(c.props) && !len(c.state) && !len(c.variables) ? '<div class="empty">No props or state.</div>' : ''}`,
      'core',
    );
    const behaviour = [
      ...(c.lifecycle || []).map((e) => node(`${ico('effect', 'zap', 'sm')}${esc(e.via)} <span class="muted small">${e.deps ? (e.deps.length ? `[${esc(e.deps.join(', '))}]` : 'once') : /^use/.test(e.via) ? 'every render' : ''}</span>`, (e.calls || []).slice(0, 6).map((x) => kv(x, '')).join('') || '<div class="empty">no calls</div>')),
      ...(c.functions || []).map((f) => node(`${ico('fn', 'fn', 'sm')}${esc(f.name)}()${f.used === false ? '<span class="tag-unused">unused</span>' : ''}`, [...(f.sets || []).map((s) => kv(`sets ${s}`, '')), ...(f.calls || []).filter((x) => !(f.sets || []).length || !/^set[A-Z]/.test(x)).slice(0, 4).map((x) => kv(x, ''))].join('') || '<div class="empty">no calls</div>')),
    ];
    const outputs = [
      ...(c.apiCalls || []).map((a) => node(`${methodBadge(a.method)}`, kv(a.target ?? '?', '') + `<div class="small muted">${esc(a.via)} · ${esc(a.in)}</div>`)),
      ...(c.store?.writes || []).map((w) => node(`${ico('store', 'layers', 'sm')}dispatch`, kv(w.action, w.storeId ? `→ ${STORES[w.storeId]?.name ?? w.storeId}` : '') + `<div class="small muted">${esc(w.in ?? w.via)}</div>`)),
      ...(c.timers || []).map((t) => node(`${ico('timer', 'timer', 'sm')}${esc(t.call)}${t.cleared === false ? ' <span class="badge danger">leak</span>' : t.cleared ? ' <span class="badge ok">released</span>' : ''}`, `<div class="small muted">${esc(t.event ? `'${t.event}' · ` : '')}${esc(t.in)}</div>`)),
    ];
    const children = [
      ...(c.renders || []).map((cid) => {
        const n = sites(c.passes?.[cid]).length;
        return node(`${compIco(cid)}<a href="${compHref(cid)}">${esc(nm(cid))}</a>${n > 1 ? ` <span class="muted small">×${n}</span>` : ''}`, mergedPasses(c.passes?.[cid]).map((x) => kv(x.name, x.varies ? 'varies per use' : x.value)).join('') || '<div class="empty">no props</div>');
      }),
      ...((c.externals || []).length ? [node(`${ico('var', 'external', 'sm')}Library`, c.externals.map((x) => kv(x.split('#')[1] || x, x.split('#')[0])).join(''))] : []),
    ];
    const empty = (t) => `<div class="node"><div class="empty">${t}</div></div>`;
    return `<div class="flow">
      ${lane('Inputs', 'propIn', 'prop', inputs.join('') || empty('No parent: entry component'))}
      ${lane('Component', 'cube', 'comp', core)}
      ${lane('Behaviour', 'zap', 'effect', behaviour.join('') || empty('No effects or handlers'))}
      ${lane('Side effects', 'swap', 'api', outputs.join('') || empty('No API calls, dispatches or timers'))}
      ${lane('Renders', 'propOut', 'prop', children.join('') || empty('No child components'))}
    </div>
    <p class="small muted">Read left to right: what flows in (parent props, route params, store reads), what the component holds, what runs (effects, handlers), what it causes (requests, dispatches, timers) and what it passes down.</p>`;
  }

  function family(m, trails, trail) {
    const c = m.c;
    const id = m.id;
    const parents = c.usedBy || [];
    const trailRows = trails.length
      ? trails.map((t) => `<div style="padding:6px 0;border-bottom:1px solid var(--border)">${trailCrumbs(t).replace('class="crumbs"', 'class="crumbs" style="margin:0"')}</div>`).join('')
      : '<p class="none">Not reachable from any page.</p>';
    const siblingRows = parents.map((pid) => {
      const sibs = (C[pid]?.renders || []).filter((x) => x !== id);
      return `<div style="margin-bottom:10px"><div class="small muted" style="margin-bottom:4px">under ${compChip(pid)}</div>${chips(sibs, (x) => compChip(x), 'No siblings')}</div>`;
    });
    return `<div class="grid">
      ${card('Paths from pages', ico('route', 'sitemap'), trailRows, { wide: true, count: trails.length, sub: trail ? 'Every route → layout → … chain that ends at this component.' : '' })}
      ${card('Parents & the props they pass', ico('prop', 'up'), parents.length ? `<div class="table-wrap"><table><thead><tr><th>Parent</th><th>Props passed</th><th></th></tr></thead><tbody>${parents.map((pid) => `<tr><td>${compChip(pid)}</td><td colspan="2">${siteRows(C[pid]?.file, C[pid]?.passes?.[id]) || '<span class="muted small">none</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No parent components.</p>', { count: parents.length })}
      ${card('Siblings', ico('comp', 'siblings'), siblingRows.join('') || '<p class="none">No parents, so no siblings.</p>')}
      ${card('Children & the props they receive', ico('prop', 'down'), (c.renders || []).length ? `<div class="table-wrap"><table><thead><tr><th>Child</th><th>Props passed</th><th></th></tr></thead><tbody>${c.renders.map((cid) => `<tr><td>${compChip(cid)}${sites(c.passes?.[cid]).length > 1 ? `<div class="small muted" style="margin-top:4px">rendered ${sites(c.passes?.[cid]).length}×</div>` : ''}</td><td colspan="2">${siteRows(c.file, c.passes?.[cid]) || '<span class="muted small">none</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">Renders no project components.</p>', { count: len(c.renders) })}
      ${card('Neighbourhood graph', ico('comp', 'graph'), graphFor({ focus: 'c:' + id, depth: 2 }, true), { wide: true })}
    </div>`;
  }

  function internals(m) {
    const c = m.c;
    const setBy = (setter) => [...(c.functions || []).filter((f) => (f.calls || []).includes(setter)).map((f) => `${f.name}()`), ...(c.lifecycle || []).filter((e) => (e.calls || []).includes(setter)).map((e) => `${e.via} L${e.line}`)];
    const state = Object.entries(c.state || {});
    const props = Object.entries(c.props || {});
    const received = (name) => (c.usedBy || []).map((pid) => C[pid]?.passes?.[m.id]?.find((x) => x.name === name)).filter(Boolean).map((x) => x.value);
    return `<div class="grid">
      ${card('State', ico('state', 'database'), state.length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Source</th><th>Initial</th><th>Setter</th><th>Updated by</th></tr></thead><tbody>${state.map(([n, s]) => `<tr data-focus="state:${esc(n)}"><td><code>${esc(n)}</code>${s.type ? `<div class="small muted"><code>${esc(s.type)}</code></div>` : ''}</td><td>${esc(s.source)}${s.reducer ? `<div class="small muted">reducer <code>${esc(s.reducer)}</code></div>` : ''}</td><td><code>${esc(s.initial ?? '')}</code></td><td><code>${esc(s.setter ?? '')}</code></td><td class="small">${s.setter ? setBy(s.setter).map(esc).join(', ') || '<span class="muted">inline handlers</span>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">Stateless.</p>', { wide: true, count: state.length })}
      ${card('Props', ico('prop', 'propIn'), props.length ? `<div class="table-wrap"><table><thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Received</th><th>Description</th></tr></thead><tbody>${props.map(([n, p]) => `<tr data-focus="prop:${esc(n)}"><td><code>${esc(n)}</code>${p.required ? '<span class="req" title="required">*</span>' : ''}</td><td><code>${esc(p.type)}</code></td><td>${p.default != null ? `<code>${esc(p.default)}</code>` : ''}</td><td class="small">${received(n).map((v) => `<code>${esc(v)}</code>`).join(', ')}</td><td class="small">${esc(p.description || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No props.</p>', { wide: true, count: props.length })}
      ${card('Functions & handlers', ico('fn', 'fn'), (c.functions || []).length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Kind</th><th>Sets state</th><th>Calls</th><th></th></tr></thead><tbody>${c.functions.map((f) => `<tr data-focus="fn:${esc(f.name)}"><td><code>${f.async ? 'async ' : ''}${esc(f.name)}(${esc(f.params || '')})</code>${f.used === false ? '<span class="tag-unused">unused</span>' : ''}${f.memoized ? ' <span class="badge">useCallback</span>' : ''}</td><td class="small">${esc(f.kind)}</td><td class="small">${(f.sets || []).map((s) => `<code class="setter">${esc(s)}</code>`).join(', ')}</td><td class="small">${(f.calls || []).slice(0, 8).map((x) => `<code>${esc(x)}</code>`).join(', ')}</td><td>${lineRef(c.file, f.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No inner functions.</p>', { wide: true, count: len(c.functions) })}
      ${card('Variables', ico('var', 'variable'), (c.variables || []).length ? `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Kind</th><th>Value</th><th></th></tr></thead><tbody>${c.variables.map((v) => `<tr data-focus="var:${esc(v.name)}"><td><code>${esc(v.name)}</code>${v.used === false ? '<span class="tag-unused">unused</span>' : ''}</td><td class="small">${esc(v.kind)}</td><td><code>${esc(v.value ?? '')}</code></td><td>${lineRef(c.file, v.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No local variables.</p>', { count: len(c.variables) })}
      ${card('Hooks, context & refs', ico('hook', 'anchor'), `${chips(c.hooks, (h) => `<a class="chip plain" href="${dirHref('', 'hook:' + h.name)}" title="${esc(h.category)}">${esc(h.name)}${h.count ? ` <span class="n">×${h.count}</span>` : ''}</a>`, c.kind === 'class' ? 'Class component: no hooks.' : 'No hooks.')}
        ${len(c.context) ? `<div style="margin-top:12px">${chips(c.context, (x) => (STORES['context:' + x] ? storeChip('context:' + x) : `<span class="chip plain">${esc(x)}</span>`))}</div>` : ''}
        ${len(c.refs) ? `<div style="margin-top:12px">${chips(c.refs, (x) => `<span class="chip">${ico('var', 'pin', 'sm')}${esc(x)}</span>`)}</div>` : ''}`, { count: len(c.hooks) })}
    </div>`;
  }

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
    getDerivedStateFromError: { error: 'when a child throws (render)' },
    componentDidCatch: { error: 'when a child throws (commit)' },
  };

  function lifecycleMatrix(c) {
    const events = c.lifecycle || [];
    if (!events.length) return `<p class="none">${c.kind === 'class' ? 'No lifecycle methods besides render.' : 'No effects: output depends only on props, state and context.'}</p>`;
    const setters = Object.fromEntries(Object.entries(c.state || {}).filter(([, s]) => s.setter).map(([n, s]) => [s.setter, s.source === 'class' ? 'state' : n]));
    const phases = ['mount', 'update', 'unmount', 'error'].filter((ph) => ph !== 'error' || events.some((e) => e.phases.includes('error')));
    const callList = (calls) => (calls && calls.length ? `<ul>${calls.map((fn) => (setters[fn] ? `<li><code class="setter">${esc(fn)}</code> → <code>${esc(setters[fn])}</code></li>` : `<li><code>${esc(fn)}</code></li>`)).join('')}</ul>` : '');
    const isEffect = (e) => /^use/.test(e.via);
    const when = (e) => (!isEffect(e) ? '' : !e.deps ? 'every render' : e.deps.length ? `deps: ${e.deps.join(', ')}` : 'once');
    const cell = (e, ph) => {
      if (!e.phases.includes(ph)) return '<div class="lc-cell"></div>';
      let text = CLASS_TEXT[e.via]?.[ph] || ph;
      let calls = e.calls;
      if (isEffect(e)) {
        if (ph === 'mount') text = e.via === 'useEffect' ? 'after first paint' : 'before paint';
        if (ph === 'update') text = (e.deps ? `when <code>${esc(e.deps.join(', '))}</code> change` : 'after every render') + (e.cleanup ? ' (cleanup first)' : '');
        if (ph === 'unmount') {
          text = 'cleanup';
          calls = e.cleanup;
        }
      }
      return `<div class="lc-cell ${ph}"><span class="dot"></span>${text}${callList(calls)}</div>`;
    };
    return `<div class="lifecycle" style="grid-template-columns:minmax(150px,1fr) repeat(${phases.length},minmax(150px,1fr))"><div class="lc-head label">Hook / method</div>${phases.map((ph) => `<div class="lc-head ${ph}">${ph}</div>`).join('')}${events.map((e) => `<div class="lc-label"><code>${esc(e.via)}</code> ${lineRef(c.file, e.line)}<div class="muted small">${esc(when(e))}</div></div>${phases.map((ph) => cell(e, ph)).join('')}`).join('')}</div>`;
  }

  function lifecycleTab(m) {
    const c = m.c;
    const leaks = (c.issues || []).filter((i) => ['memory-leak', 'render-loop', 'unsafe-async-update', 'missing-dependency', 'side-effect-in-render'].includes(i.type));
    const TIMER_ICON = { interval: 'timer', timeout: 'timer', 'animation-frame': 'timer', 'idle-callback': 'timer', listener: 'radio', subscription: 'radio', observer: 'eye', socket: 'radio' };
    return `<div class="grid">
      ${leaks.length ? card('Lifecycle problems', ico('issue', 'droplet'), issueList(leaks.map((i) => ({ ...i, id: m.id })), false), { wide: true, count: leaks.length }) : ''}
      ${card('Lifecycle', ico('effect', 'cycle'), lifecycleMatrix(c), { wide: true, count: len(c.lifecycle) })}
      ${card('Timers, listeners & subscriptions', ico('timer', 'timer'), (c.timers || []).length ? `<div class="table-wrap"><table><thead><tr><th>Resource</th><th>Started in</th><th>Released</th><th></th></tr></thead><tbody>${c.timers.map((t) => `<tr><td>${ico('timer', TIMER_ICON[t.type] || 'timer', 'sm')} <code>${esc(t.call)}</code>${t.event ? ` <span class="muted small">'${esc(t.event)}'</span>` : ''}</td><td class="small">${esc(t.in)}</td><td>${t.cleared === true ? `<span class="badge ok">${I('check', 'sm')} released</span>` : t.cleared === false ? `<span class="badge danger">${I('x', 'sm')} never released</span>` : '<span class="badge">one-shot</span>'}</td><td>${lineRef(c.file, t.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No timers, listeners, subscriptions or observers.</p>', { wide: true, count: len(c.timers) })}
    </div>`;
  }

  function dataTab(m) {
    const c = m.c;
    const reads = c.store?.reads || [];
    const writes = c.store?.writes || [];
    return `<div class="grid">
      ${card('API calls', ico('api', 'swap'), (c.apiCalls || []).length ? `<div class="table-wrap"><table><thead><tr><th>Method</th><th>Endpoint</th><th>Client</th><th>Runs in</th><th></th></tr></thead><tbody>${c.apiCalls.map((a) => `<tr><td>${methodBadge(a.method)}</td><td><code>${esc(a.target ?? '?')}</code>${a.module ? `<div class="small muted">${esc(a.module)}</div>` : ''}</td><td class="small">${esc(a.via)}</td><td class="small">${esc(a.in)}</td><td>${lineRef(c.file, a.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">This component makes no API calls.</p>', { wide: true, count: len(c.apiCalls) })}
      ${card('Global state', ico('store', 'layers'), reads.length || writes.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Store</th><th>Path / action</th><th>Via</th><th></th></tr></thead><tbody>${reads.map((r) => `<tr><td><span class="badge k-context">read</span></td><td>${r.storeId ? storeChip(r.storeId) : esc(r.store ?? r.kind)}</td><td><code>${esc(r.path ?? '')}</code></td><td class="small">${esc(r.via)}</td><td>${lineRef(c.file, r.line)}</td></tr>`).join('')}${writes.map((w) => `<tr><td><span class="badge k-store">write</span></td><td>${w.storeId ? storeChip(w.storeId) : esc(w.kind)}</td><td><code>${esc(w.action)}</code></td><td class="small">${esc(w.via)}${w.in ? ` · ${esc(w.in)}` : ''}</td><td>${lineRef(c.file, w.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No Redux, context or zustand usage.</p>', { wide: true, count: reads.length + writes.length })}
      ${card('Validation', ico('valid', 'shield'), (c.validation || []).length ? `<div class="table-wrap"><table><thead><tr><th>Via</th><th>Target</th><th>Rules</th><th></th></tr></thead><tbody>${c.validation.map((v) => `<tr><td><span class="badge k-valid">${esc(v.via)}</span></td><td><code>${esc(v.schema ?? v.field ?? v.fn ?? '')}</code></td><td>${chips(v.rules, (r) => `<span class="chip plain mono">${esc(r)}</span>`, '—')}</td><td>${lineRef(c.file, v.line)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="none">No validation rules.</p>', { wide: true, count: len(c.validation) })}
    </div>`;
  }

  function stylesTab(m) {
    const st = m.c.styles || {};
    const classRow = (x) => `<tr><td><code>.${esc(x.name)}</code></td><td>${x.at ? fileRef(x.at.slice(0, x.at.lastIndexOf(':')), x.at.slice(x.at.lastIndexOf(':') + 1)) : '<span class="muted small">no rule in project CSS (utility / framework class)</span>'}</td><td><a class="small" href="${dirHref('', 'class:' + x.name)}">who else uses it</a></td></tr>`;
    return `<div class="grid">
      ${card('Class names', ico('style', 'palette'), (st.classes || []).length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Defined at</th><th></th></tr></thead><tbody>${st.classes.map(classRow).join('')}</tbody></table></div>` : '<p class="none">No plain className strings.</p>', { wide: true, count: len(st.classes) })}
      ${(st.modules || []).map((mo) => card(`CSS module ${esc(mo.file)}`, ico('style', 'palette'), `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Defined at</th><th></th></tr></thead><tbody>${mo.classes.map(classRow).join('')}</tbody></table></div>`, { wide: true, count: mo.classes.length })).join('')}
      ${card('Stylesheets imported', ico('style', 'page'), chips(st.sheets, (s) => `<span class="chip">${fileRef(s)}</span>`, 'None imported by this file.'))}
    </div>`;
  }

  // ---------- view: components explorer ----------
  const QUICK = [
    ['has:state', 'Stateful'],
    ['has:effects', 'Effects'],
    ['has:api', 'API'],
    ['has:store', 'Global state'],
    ['has:issues', 'Has issues'],
    ['is:leaky', 'Leaks'],
    ['is:shared', 'Shared'],
    ['is:unused', 'Unused'],
    ['kind:class', 'Class'],
  ];
  const SORTS = {
    name: (a, b) => natural(a.name, b.name),
    issues: (a, b) => b.issues - a.issues || natural(a.name, b.name),
    used: (a, b) => b.usedBy - a.usedBy || b.pages - a.pages || natural(a.name, b.name),
    complex: (a, b) => b.score - a.score || natural(a.name, b.name),
  };
  const ui = { sort: store.get('sort', 'name') };

  function tile(m) {
    const c = m.c;
    return `<a class="tile${c.status === 'deprecated' ? ' deprecated' : ''}" href="${compHref(m.id)}">
      <div class="tile-h">${compIco(m.id, '')}<span class="tile-name">${esc(c.name)}</span>${m.worst ? `<span class="dot ${m.worst}" title="${m.issues} issue(s)"></span>` : ''}</div>
      <div class="tile-file">${esc(baseName(c.file))}${c.line ? `:${c.line}` : ''}</div>
      ${c.description ? `<p class="tile-desc">${esc(c.description)}</p>` : ''}
      <div class="tile-metrics">${mini('prop', 'propIn', m.props, 'props')}${compMinis(c)}</div>
      <div class="tile-foot"><span>${I('up', 'sm')} ${m.usedBy} parents</span><span>${I('globe', 'sm')} ${m.pages} pages</span><span style="margin-left:auto">${esc(LEVELS[m.level])}</span></div>
    </a>`;
  }

  function viewComponents(path, q) {
    const node = findDir(path);
    const isRoot = !node.path;
    const parts = node.path ? node.path.split('/') : [];
    main.innerHTML = `
      ${crumbs([{ href: '#/components', html: `${I('grid', 'sm')}Components` }, ...parts.map((p, i) => ({ href: dirHref(parts.slice(0, i + 1).join('/')), html: `${I('folder', 'sm')}${esc(p)}` }))].map((x, i, a) => (i === a.length - 1 ? { html: x.html } : x)))}
      <div class="vh"><div class="vh-title">${ico(isRoot ? 'comp' : 'folder', isRoot ? 'grid' : 'folder', 'lg')}<div><h1>${isRoot ? 'Components' : esc(node.name)}</h1><div class="sub">${node.all.length} components${isRoot ? ' across the project' : ' in this folder and below'}</div></div></div></div>
      <div class="toolbar">
        <input class="filter-input" id="folder-q" type="search" placeholder="Filter… e.g. hook:useEffect is:leaky api:/orders" value="${esc(q)}" autocomplete="off" />
        <select class="sort" id="sort">${Object.keys(SORTS).map((k) => `<option value="${k}"${ui.sort === k ? ' selected' : ''}>Sort: ${{ name: 'name', issues: 'issues', used: 'most used', complex: 'complexity' }[k]}</option>`).join('')}</select>
        ${QUICK.map(([tok, label]) => `<button class="fchip" data-tok="${tok}">${label}</button>`).join('')}
        <span class="result-count" id="result-count"></span>
      </div>
      <div id="folder-body"></div>`;
    const input = $('#folder-q');
    const draw = () => {
      const query = input.value;
      const pq = idx.parse(query);
      $$('[data-tok]').forEach((b) => b.classList.toggle('on', query.split(/\s+/).includes(b.dataset.tok)));
      const body = $('#folder-body');
      if (pq.empty) {
        const dirs = [...node.dirs.values()].sort((a, b) => natural(a.name, b.name));
        const own = [...node.comps].sort(SORTS[ui.sort]);
        $('#result-count').textContent = `${node.all.length} components`;
        body.innerHTML =
          (dirs.length ? `<section class="section"><div class="section-h"><h2>Folders</h2><span class="count">${dirs.length}</span></div><div class="folder-tiles">${dirs.map((d) => `<a class="folder-tile" href="${dirHref(d.path)}">${ico('folder', 'folder')}<div style="min-width:0"><div class="fn">${esc(d.name)}</div><div class="fm">${d.all.length} components${d.all.some((x) => x.worst === 'high') ? ` · <span style="color:var(--danger)">${d.all.filter((x) => x.issues).length} with issues</span>` : ''}</div></div></a>`).join('')}</div></section>` : '') +
          (own.length ? `<section class="section"><div class="section-h"><h2>Components</h2><span class="count">${own.length}</span></div><div class="tiles">${own.map(tile).join('')}</div></section>` : '');
        return;
      }
      const hits = idx.run(pq, node.all);
      if (!pq.terms.length) hits.sort(SORTS[ui.sort]);
      $('#result-count').textContent = `${hits.length} match${hits.length === 1 ? '' : 'es'}`;
      if (!hits.length) return void (body.innerHTML = card('No matches', ico('var', 'search'), `<p class="none">Nothing matches <code>${esc(query)}</code>.</p><table style="margin-top:10px"><tbody>${QUERY_HELP.map(([t, d]) => `<tr><td><code>${esc(t)}</code></td><td class="muted small">${esc(d)}</td></tr>`).join('')}</tbody></table>`));
      const groups = new Map();
      hits.slice(0, 400).forEach((m) => (groups.get(m.dir) || groups.set(m.dir, []).get(m.dir)).push(m));
      body.innerHTML = [...groups].map(([dir, list]) => `<section class="section"><div class="section-h">${ico('folder', 'folder', 'sm')}<a class="mono" href="${dirHref(dir)}">${esc(dir || '/')}</a><span class="count">${list.length}</span></div><div class="tiles">${list.map(tile).join('')}</div></section>`).join('');
    };
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        history.replaceState(null, '', node.path ? dirHref(node.path, input.value.trim()) : `#/components${qs({ q: input.value.trim() })}`);
        draw();
      }, 80);
    });
    $('#sort').addEventListener('change', (e) => {
      ui.sort = e.target.value;
      store.set('sort', ui.sort);
      draw();
    });
    $$('[data-tok]').forEach((b) =>
      b.addEventListener('click', () => {
        const toks = input.value.split(/\s+/).filter(Boolean);
        input.value = (toks.includes(b.dataset.tok) ? toks.filter((t) => t !== b.dataset.tok) : [...toks, b.dataset.tok]).join(' ');
        input.dispatchEvent(new Event('input'));
      }),
    );
    draw();
  }

  // ---------- view: global state ----------
  function storeCard(sid) {
    const s = STORES[sid];
    const [k, i] = storeIconOf(s);
    const kindLabel = { 'redux-slice': 'Redux slice', context: 'React context', zustand: 'zustand store' }[s.kind] || s.kind;
    return `<section class="card store-card" id="store-${esc(sid)}">
      <div class="card-h">${ico(k, i)}<h3>${esc(s.name)}</h3><span class="badge k-${k}">${kindLabel}</span></div>
      <div class="small">${fileRef(s.file, s.line)}${s.key && s.key !== s.name ? ` · mounted at <code>state.${esc(s.key)}</code>` : ''}</div>
      ${s.state?.length ? `<div class="row"><span>State</span><div class="state-keys">${s.state.map((x) => `<span class="chip plain mono">${esc(x)}</span>`).join('')}</div></div>` : ''}
      ${s.actions?.length ? `<div class="row"><span>Actions</span><div class="state-keys">${s.actions.map((x) => `<span class="chip plain mono">${esc(x)}</span>`).join('')}</div></div>` : ''}
      ${s.thunks?.length ? `<div class="row"><span>Thunks</span><div class="state-keys">${s.thunks.map((x) => `<span class="chip plain mono">${esc(x)}</span>`).join('')}</div></div>` : ''}
      ${s.default ? `<div class="row"><span>Default</span><code class="small">${esc(s.default)}</code></div>` : ''}
      ${s.providers ? `<div class="row"><span>Provided by</span>${chips(s.providers, (x) => compChip(x), 'No provider found')}</div>` : ''}
      <div class="row"><span>Read by</span>${chips(s.readers, (x) => compChip(x), 'Nobody')}</div>
      <div class="row"><span>Written by</span>${chips(s.writers, (x) => compChip(x), 'Nobody')}</div>
    </section>`;
  }

  function viewState(params) {
    const focus = params.get('store');
    const ids = Object.keys(STORES).sort((a, b) => (a === focus ? -1 : b === focus ? 1 : natural(a, b)));
    const focusIds = focus && STORES[focus] ? [focus] : ids;
    const writers = [...new Set(focusIds.flatMap((s) => [...STORES[s].writers, ...(STORES[s].providers || [])]))];
    const readers = [...new Set(focusIds.flatMap((s) => STORES[s].readers))];
    const cols = [
      { title: 'WRITERS / PROVIDERS', nodes: writers.map((x) => ({ key: 'w:' + x, label: nm(x), href: compHref(x) })) },
      { title: 'STORES', nodes: focusIds.map((s) => ({ key: 's:' + s, label: STORES[s].name, cls: 'store' + (s === focus ? ' focus' : ''), href: storeHref(s) })) },
      { title: 'READERS', nodes: readers.map((x) => ({ key: 'r:' + x, label: nm(x), href: compHref(x) })) },
    ];
    const edges = [...focusIds.flatMap((s) => [...STORES[s].writers, ...(STORES[s].providers || [])].map((w) => ({ from: 'w:' + w, to: 's:' + s }))), ...focusIds.flatMap((s) => STORES[s].readers.map((r) => ({ from: 's:' + s, to: 'r:' + r })))];
    main.innerHTML = `
      ${crumbs([{ href: '#/', html: `${I('sitemap', 'sm')}Site map` }, { html: `${I('layers', 'sm')}Global state` }])}
      <div class="vh"><div class="vh-title">${ico('store', 'layers', 'lg')}<div><h1>Global state</h1><div class="sub">Redux slices, React contexts and zustand stores, with the components that provide, read and write them.</div></div></div>${focus ? `<a class="btn" href="#/state">${I('list', 'sm')} All stores</a>` : ''}</div>
      ${ids.length ? `${card(focus ? `Data flow through ${esc(STORES[focus]?.name ?? focus)}` : 'Who writes and who reads', ico('store', 'flow'), graphSVG(cols.filter((c) => c.nodes.length), edges, true), { wide: true })}<div class="grid" style="margin-top:16px">${ids.map(storeCard).join('')}</div>` : `<div class="card"><p class="none">No global state detected.</p></div>`}`;
    if (focus) setTimeout(() => document.getElementById('store-' + focus)?.scrollIntoView({ block: 'start' }), 30);
  }

  // ---------- view: health ----------
  function viewHealth(params) {
    const type = params.get('type');
    const sev = params.get('severity');
    const view = params.get('view');
    const all = comps.flatMap((m) => (m.c.issues || []).map((i) => ({ ...i, id: m.id })));
    const types = [...new Set(all.map((i) => i.type))].sort();
    const filtered = all.filter((i) => (!type || i.type === type) && (!sev || i.severity === sev));
    const counts = HEALTH.issues || {};
    const deadCode = () => {
      const rows = [];
      if (HEALTH.unusedComponents?.length) rows.push(card('Unused components', ico('issue', 'trash'), `<div class="table-wrap"><table><tbody>${HEALTH.unusedComponents.map((id) => `<tr><td>${compChip(id)}</td><td>${fileRef(C[id]?.file, C[id]?.line)}</td></tr>`).join('')}</tbody></table></div>`, { count: HEALTH.unusedComponents.length, sub: 'Not rendered by any component and not reachable from any route.' }));
      if (HEALTH.unusedFiles?.length) rows.push(card('Unused files', ico('issue', 'page'), `<div class="table-wrap"><table><tbody>${HEALTH.unusedFiles.map((f) => `<tr><td>${fileRef(f)}</td></tr>`).join('')}</tbody></table></div>`, { count: HEALTH.unusedFiles.length, sub: 'No other module imports them.' }));
      if (HEALTH.unusedExports?.length) rows.push(card('Exports nobody imports', ico('issue', 'propOut'), `<div class="table-wrap"><table><tbody>${HEALTH.unusedExports.map((e) => `<tr><td><code>${esc(e.name)}</code></td><td>${fileRef(e.file)}</td></tr>`).join('')}</tbody></table></div>`, { count: HEALTH.unusedExports.length }));
      if (HEALTH.unusedImports?.length) rows.push(card('Unused imports', ico('issue', 'propIn'), `<div class="table-wrap"><table><tbody>${HEALTH.unusedImports.map((u) => `<tr><td><code>${esc(u.name)}</code> <span class="muted small">from ${esc(u.source)}</span></td><td>${fileRef(u.file, u.line)}</td></tr>`).join('')}</tbody></table></div>`, { count: HEALTH.unusedImports.length }));
      return rows.length ? `<div class="grid">${rows.join('')}</div>` : `<div class="all-good">${I('check')} No dead code found.</div>`;
    };
    const apiView = () =>
      ENDPOINTS.size
        ? card('API endpoints', ico('api', 'swap'), `<div class="table-wrap"><table><thead><tr><th>Method</th><th>Endpoint</th><th>Called from</th></tr></thead><tbody>${[...ENDPOINTS.values()].sort((a, b) => natural(a.target ?? '', b.target ?? '')).map((e) => `<tr><td>${methodBadge(e.method)}</td><td><code>${esc(e.target ?? '?')}</code></td><td>${e.users.map((u) => `<div style="margin-bottom:4px">${compChip(u.id)} <span class="muted small">${esc(u.via)} · ${esc(u.in)}</span> ${lineRef(C[u.id].file, u.line)}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div>`, { wide: true, count: ENDPOINTS.size })
        : '<p class="none">No API calls detected.</p>';
    const sevCard = (s, icon) => `<a class="stat" href="${healthHref({ severity: sev === s ? undefined : s })}" style="${sev === s ? 'border-color:var(--accent)' : ''}"><span class="ico lg sev-icon ${s}" style="background:var(--surface-2)">${I(icon)}</span><div><div class="v">${counts[s] ?? 0}</div><div class="k">${s}</div></div></a>`;
    main.innerHTML = `
      ${crumbs([{ href: '#/', html: `${I('sitemap', 'sm')}Site map` }, { html: `${I('pulse', 'sm')}Health` }])}
      <div class="vh"><div class="vh-title">${ico('issue', 'pulse', 'lg')}<div><h1>Health</h1><div class="sub">Memory leaks, render loops, unsafe async updates, stale dependencies and dead code, each with the exact file and line.</div></div></div></div>
      <div class="stats">${sevCard('high', 'alertCircle')}${sevCard('medium', 'alert')}${sevCard('low', 'info')}${sevCard('info', 'info')}</div>
      <div class="toolbar" style="position:static">
        <a class="fchip${!type && !view ? ' on' : ''}" href="${healthHref({ severity: sev })}">All issues</a>
        ${types.map((t) => `<a class="fchip${type === t ? ' on' : ''}" href="${healthHref({ type: t, severity: sev })}">${esc(t.replace(/-/g, ' '))} <span class="muted">${all.filter((i) => i.type === t).length}</span></a>`).join('')}
        <a class="fchip${type === 'dead-code' ? ' on' : ''}" href="${healthHref({ type: 'dead-code' })}">${I('trash', 'sm')} dead code</a>
        <a class="fchip${view === 'api' ? ' on' : ''}" href="${healthHref({ view: 'api' })}">${I('swap', 'sm')} API map</a>
      </div>
      <div id="health-body"></div>`;
    $('#health-body').innerHTML = view === 'api' ? apiView() : type === 'dead-code' ? deadCode() : card(type ? esc(type.replace(/-/g, ' ')) : 'All component issues', ico('issue', 'alert'), issueList(filtered), { wide: true, count: filtered.length }) + (type ? '' : `<div style="margin-top:20px">${deadCode()}</div>`);
  }

  // ---------- graph ----------
  const hueCache = new Map();
  function hueOf(dir) {
    const top = dir.split('/').slice(0, 2).join('/');
    if (!hueCache.has(top)) {
      let h = 0;
      for (const ch of top) h = (h * 31 + ch.charCodeAt(0)) % 360;
      hueCache.set(top, h);
    }
    return hueCache.get(top);
  }
  function neighbourhood(focus, depth, down) {
    const routes = new Set();
    const ids = new Set();
    let frontier = [focus];
    const seen = new Set([focus]);
    for (let d = 0; d <= depth && frontier.length; d++) {
      const next = [];
      for (const key of frontier) {
        const [type, ...rest] = key.split(':');
        const id = rest.join(':');
        if (type === 'p') {
          if (!P[id]) continue;
          routes.add(id);
          if (d < depth) [...(P[id].layouts || []), P[id].component].filter(Boolean).forEach((x) => next.push('c:' + x));
        } else {
          if (!C[id]) continue;
          ids.add(id);
          if (d < depth) {
            (C[id].renders || []).forEach((x) => next.push('c:' + x));
            if (!down) {
              (C[id].usedBy || []).forEach((x) => next.push('c:' + x));
              Object.entries(P).filter(([, p]) => p.component === id || (p.layouts || []).includes(id)).forEach(([r]) => next.push('p:' + r));
            }
          }
        }
      }
      frontier = next.filter((k) => !seen.has(k) && seen.add(k));
    }
    return { routes: [...routes], ids: [...ids] };
  }
  let graphOpts = {};
  function graphFor(opts, inline) {
    let routes;
    let ids;
    if (opts.focus) ({ routes, ids } = neighbourhood(opts.focus, opts.depth ?? 2, opts.down));
    else if (opts.dir != null) {
      ids = findDir(opts.dir).all.map((m) => m.id);
      const set = new Set(ids);
      routes = ROUTES.filter((r) => [...(P[r].layouts || []), P[r].component].some((x) => set.has(x)));
    } else {
      ids = Object.keys(C);
      routes = ROUTES;
    }
    if (!opts.force && ids.length + routes.length > 400) return `<div class="graph-wrap${inline ? ' inline' : ''}"><div class="graph-note"><p><b>${ids.length + routes.length} nodes</b> is too many to read at once.</p><p>Pick a focus or a folder above, or <a href="#" data-force-graph>render everything anyway</a>.</p></div></div>`;
    if (!ids.length && !routes.length) return '<p class="none">Nothing to draw.</p>';
    return layeredGraph(routes, ids, opts.focus, inline);
  }
  function layeredGraph(routes, compIds, focusKey, inline) {
    const ids = new Set(compIds);
    const depth = new Map();
    const roots = new Set(routes.flatMap((r) => [...(P[r].layouts || []), P[r].component]).filter((id) => ids.has(id)));
    for (const id of ids) depth.set(id, roots.has(id) || !(C[id].usedBy || []).some((u) => ids.has(u)) ? 1 : 0);
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
    const nodeOf = (id) => ({ key: 'c:' + id, label: C[id].name, href: compHref(id), title: `${C[id].name} — ${C[id].file}`, hue: hueOf(dirOf(C[id].file)), cls: focusKey === 'c:' + id ? 'focus' : '' });
    const columns = [{ title: 'PAGES', nodes: routes.map((r) => ({ key: 'p:' + r, label: r, cls: 'page' + (focusKey === 'p:' + r ? ' focus' : ''), href: pageHref(r), title: `${r} → ${P[r].component || '?'}` })) }];
    for (let d = 1; d <= maxDepth; d++) columns.push({ title: d === 1 ? 'ROOTS' : `DEPTH ${d}`, nodes: [...ids].filter((id) => Math.max(1, depth.get(id)) === d).map(nodeOf) });
    const edges = [];
    for (const r of routes) [...(P[r].layouts || []), P[r].component].filter((id) => ids.has(id)).forEach((id) => edges.push({ from: 'p:' + r, to: 'c:' + id }));
    for (const id of ids) (C[id].renders || []).filter((c) => ids.has(c)).forEach((c) => edges.push({ from: 'c:' + id, to: 'c:' + c }));
    const parentsOf = new Map();
    edges.forEach((e) => (parentsOf.get(e.to) || parentsOf.set(e.to, []).get(e.to)).push(e.from));
    const index = new Map();
    columns[0].nodes.forEach((n, i) => index.set(n.key, i));
    for (let ci = 1; ci < columns.length; ci++) {
      const score = (n) => {
        const ps = (parentsOf.get(n.key) || []).filter((k) => index.has(k)).map((k) => index.get(k));
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity;
      };
      const scored = columns[ci].nodes.map((n) => [score(n), n]);
      scored.sort((a, b) => a[0] - b[0] || natural(a[1].label, b[1].label));
      columns[ci].nodes = scored.map((x) => x[1]);
      columns[ci].nodes.forEach((n, i) => index.set(n.key, i));
    }
    return graphSVG(columns.filter((c) => c.nodes.length), edges, inline);
  }
  function graphSVG(columns, edges, inline) {
    const NODE_H = 30;
    const V_GAP = 10;
    const H_GAP = 80;
    const PAD = 20;
    const TOP = 34;
    const widthOf = (label) => Math.min(250, Math.max(96, label.length * 7.4 + 30));
    const colWidths = columns.map((col) => Math.max(96, ...col.nodes.map((n) => widthOf(n.label))));
    const maxRows = Math.max(1, ...columns.map((c) => c.nodes.length));
    const height = TOP + maxRows * (NODE_H + V_GAP) + PAD;
    const pos = new Map();
    let x = PAD;
    columns.forEach((col, ci) => {
      const offset = ((maxRows - col.nodes.length) * (NODE_H + V_GAP)) / 2;
      col.nodes.forEach((n, i) => pos.set(n.key, { x, y: TOP + offset + i * (NODE_H + V_GAP), w: widthOf(n.label) }));
      col.x = x;
      x += colWidths[ci] + H_GAP;
    });
    const width = x - H_GAP + PAD;
    const paths = edges
      .filter((e) => pos.has(e.from) && pos.has(e.to))
      .map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        const x1 = a.x + a.w;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const dx = Math.max(30, Math.abs(x2 - x1) / 2);
        return `<path class="edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
      })
      .join('');
    const titles = columns.map((c) => `<text class="col-title" x="${c.x}" y="18">${esc(c.title)}</text>`).join('');
    const nodes = columns
      .flatMap((col) =>
        col.nodes.map((n) => {
          const p = pos.get(n.key);
          const label = n.label.length > 32 ? n.label.slice(0, 31) + '…' : n.label;
          const bar = n.hue != null ? `<rect width="4" height="${NODE_H}" rx="2" style="fill:hsl(${n.hue} 65% 55%)"/>` : '';
          return `<g class="node ${n.cls || ''}" data-key="${esc(n.key)}" data-href="${esc(n.href || '')}" transform="translate(${p.x},${p.y})"><title>${esc(n.title || n.label)}</title><rect class="box" width="${p.w}" height="${NODE_H}"/>${bar}<text x="13" y="19">${esc(label)}</text></g>`;
        }),
      )
      .join('');
    return `<div class="graph-wrap${inline ? ' inline' : ''}"><svg class="graph" data-w="${width}" data-h="${height}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}${titles}${nodes}</svg></div>`;
  }
  function wireGraphs(root = main) {
    $$('.graph-wrap', root).forEach((wrap) => {
      const svg = $('svg', wrap);
      if (!svg || wrap.dataset.wired) return;
      wrap.dataset.wired = '1';
      const edges = $$('.edge', svg);
      const nodes = $$('.node', svg);
      const byKey = new Map(nodes.map((n) => [n.dataset.key, n]));
      let moved = false;
      svg.addEventListener('mouseover', (e) => {
        const g = e.target.closest('.node');
        if (!g) return;
        const key = g.dataset.key;
        const linked = new Set([key]);
        edges.forEach((ed) => {
          const hot = ed.dataset.from === key || ed.dataset.to === key;
          ed.classList.toggle('hot', hot);
          if (hot) linked.add(ed.dataset.from).add(ed.dataset.to);
        });
        byKey.forEach((n, k) => n.classList.toggle('dim', !linked.has(k)));
      });
      svg.addEventListener('mouseleave', () => {
        edges.forEach((ed) => ed.classList.remove('hot'));
        nodes.forEach((n) => n.classList.remove('dim'));
      });
      svg.addEventListener('click', (e) => {
        const g = e.target.closest('.node');
        if (g && !moved && g.dataset.href) location.hash = g.dataset.href;
      });
      let drag = null;
      wrap.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop };
        moved = false;
      });
      wrap.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
          moved = true;
          // Capture only once a drag starts, otherwise node clicks would retarget to the wrapper.
          wrap.setPointerCapture(drag.id);
          wrap.classList.add('dragging');
        }
        if (moved) {
          wrap.scrollLeft = drag.sl - dx;
          wrap.scrollTop = drag.st - dy;
        }
      });
      const endDrag = () => {
        drag = null;
        wrap.classList.remove('dragging');
      };
      wrap.addEventListener('pointerup', endDrag);
      wrap.addEventListener('pointercancel', endDrag);
      wrap.addEventListener(
        'wheel',
        (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoom(svg, e.deltaY < 0 ? 1.15 : 1 / 1.15);
        },
        { passive: false },
      );
    });
    $$('[data-force-graph]', root).forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const holder = a.closest('.graph-wrap');
        const tmp = document.createElement('div');
        tmp.innerHTML = graphFor({ ...graphOpts, force: true });
        holder.replaceWith(tmp.firstElementChild);
        wireGraphs();
      }),
    );
  }
  function zoom(svg, factor) {
    const scale = Math.min(3, Math.max(0.2, (Number(svg.dataset.scale) || 1) * factor));
    svg.dataset.scale = scale;
    svg.setAttribute('width', svg.dataset.w * scale);
    svg.setAttribute('height', svg.dataset.h * scale);
  }
  function viewGraph(params) {
    graphOpts = { focus: params.get('focus') || '', depth: Number(params.get('depth') || 2), dir: params.get('dir') ?? undefined };
    if (!graphOpts.focus) delete graphOpts.focus;
    const options = [...comps.map((m) => `<option value="c:${esc(m.id)}">${esc(m.name)} — ${esc(m.dir)}</option>`), ...ROUTES.map((r) => `<option value="p:${esc(r)}">page ${esc(r)}</option>`)].join('');
    const dirs = [...dirIndex.keys()].filter(Boolean).sort(natural);
    main.innerHTML = `
      ${crumbs([{ href: '#/', html: `${I('sitemap', 'sm')}Site map` }, { html: `${I('graph', 'sm')}Graph` }])}
      <div class="vh"><div class="vh-title">${ico('comp', 'graph', 'lg')}<div><h1>Graph explorer</h1><div class="sub">Pages on the left; each column is one level deeper in the render tree. Hover to trace, click to open, drag to pan, Ctrl + wheel to zoom.</div></div></div></div>
      <div class="graph-bar">
        <input id="g-focus" list="g-nodes" placeholder="Focus: component or page…" value="${esc(graphOpts.focus || '')}" /><datalist id="g-nodes">${options}</datalist>
        <select id="g-depth">${[1, 2, 3, 4, 6, 8].map((d) => `<option value="${d}"${d === graphOpts.depth ? ' selected' : ''}>±${d} levels</option>`).join('')}</select>
        <select id="g-dir"><option value="">All folders</option>${dirs.map((d) => `<option value="${esc(d)}"${d === graphOpts.dir ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <button class="btn" id="g-clear">Reset</button>
        <span style="margin-left:auto" class="btn-row"><button class="btn" data-zoom="0.8">−</button><button class="btn" data-zoom="1.25">+</button><button class="btn" data-zoom="fit">Fit</button></span>
      </div>
      <div id="graph-holder">${graphFor(graphOpts)}</div>`;
    const go = (patch) => {
      const next = { ...graphOpts, ...patch };
      location.hash = '#/g' + qs({ focus: next.focus, depth: next.focus && next.depth !== 2 ? next.depth : undefined, dir: !next.focus ? next.dir : undefined });
    };
    $('#g-focus').addEventListener('change', (e) => go({ focus: e.target.value.trim() }));
    $('#g-depth').addEventListener('change', (e) => go({ depth: Number(e.target.value) }));
    $('#g-dir').addEventListener('change', (e) => go({ focus: '', dir: e.target.value }));
    $('#g-clear').addEventListener('click', () => (location.hash = '#/g'));
    $$('[data-zoom]').forEach((b) =>
      b.addEventListener('click', () => {
        const svg = $('#graph-holder svg');
        if (!svg) return;
        if (b.dataset.zoom === 'fit') {
          const wrap = svg.parentElement;
          zoom(svg, Math.min(wrap.clientWidth / svg.dataset.w, wrap.clientHeight / svg.dataset.h) / (Number(svg.dataset.scale) || 1));
        } else zoom(svg, Number(b.dataset.zoom));
      }),
    );
  }

  // ---------- history ----------
  const HISTORY = window.__CATALOGUE_HISTORY__ ? [...window.__CATALOGUE_HISTORY__].reverse() : null;
  const historyFor = (id) => (HISTORY || []).filter((e) => e.changes.some((c) => c.kind === 'components' && c.key === id));
  const SIGN = { added: '+', removed: '−', changed: '~' };
  function relTime(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  }
  function detailText(d) {
    if ('from' in d || 'to' in d) return `${d.field}: ${JSON.stringify(d.from) ?? '∅'} → ${JSON.stringify(d.to) ?? '∅'}`;
    return [d.field, d.added && d.added.map((x) => `+${x}`).join(' '), d.removed && d.removed.map((x) => `−${x}`).join(' '), d.modified && d.modified.map((x) => `~${x}`).join(' ')].filter(Boolean).join(' ');
  }
  function summaryBadges(summary) {
    return Object.entries(summary)
      .flatMap(([kind, s]) => [s.added && `<span class="hbadge add">+${s.added}</span>`, s.changed && `<span class="hbadge chg">~${s.changed}</span>`, s.removed && `<span class="hbadge rem">−${s.removed}</span>`].filter(Boolean).map((b) => `${b}<span class="muted small">${kind}</span>`))
      .join('');
  }
  function changeRow(c) {
    const link = c.kind === 'pages' ? (P[c.key] ? pageChip(c.key) : `<span class="mono">${esc(c.key)}</span>`) : C[c.key] ? compChip(c.key) : `<span class="chip plain">${esc(c.key)}</span>`;
    return `<li class="hchange ${c.change}"><span class="hsign">${SIGN[c.change]}</span>${link}${c.details ? `<span class="hdetail">${c.details.map((d) => `<code>${esc(detailText(d))}</code>`).join(' ')}</span>` : ''}</li>`;
  }
  function commitCard(e, onlyKey) {
    const changes = onlyKey ? e.changes.filter((c) => c.key === onlyKey) : e.changes;
    const list = !e.parent && !onlyKey ? `<p class="muted small">Initial scan recorded ${e.summary.components.added} components and ${e.summary.pages.added} pages.</p>` : `<ul class="hchanges">${changes.map(changeRow).join('')}</ul>${e.truncated ? '<p class="muted small">List truncated.</p>' : ''}`;
    return `<article class="commit"><div class="commit-dot"></div><div class="commit-body"><div class="commit-head"><code class="commit-id">${esc(e.id.slice(0, 8))}</code><span class="commit-msg">${esc(e.message || 'scan')}</span>${summaryBadges(e.summary)}<span class="muted small commit-time" title="${esc(e.time)}">${relTime(e.time)}${e.git ? ` · git <code>${esc(e.git)}</code>` : ''}</span></div>${list}</div></article>`;
  }
  function viewHistory(q) {
    if (!HISTORY) return void (main.innerHTML = `<div class="vh"><div><h1>History</h1><p class="muted">History is disabled or this export has none.</p></div></div>`);
    main.innerHTML = `
      ${crumbs([{ href: '#/', html: `${I('sitemap', 'sm')}Site map` }, { html: `${I('history', 'sm')}History` }])}
      <div class="vh"><div class="vh-title">${ico('effect', 'history', 'lg')}<div><h1>History</h1><div class="sub">${HISTORY.length} snapshot(s). A new one is recorded whenever a scan changes components or pages.</div></div></div></div>
      <div class="toolbar"><input class="filter-input" id="hist-q" type="search" placeholder="Filter by component, page or message…" value="${esc(q)}" autocomplete="off" /><span class="result-count" id="hist-count"></span></div>
      <div class="timeline" id="timeline"></div>`;
    const input = $('#hist-q');
    const draw = () => {
      const t = input.value.trim().toLowerCase();
      const hits = t ? HISTORY.filter((e) => (e.message || '').toLowerCase().includes(t) || e.id.startsWith(t) || e.changes.some((c) => c.key.toLowerCase().includes(t))) : HISTORY;
      $('#hist-count').textContent = `${hits.length} snapshot(s)`;
      $('#timeline').innerHTML = hits.map((e) => commitCard(e)).join('') || '<p class="none">No snapshots match.</p>';
    };
    input.addEventListener('input', draw);
    draw();
  }
  function componentHistory(id) {
    if (!HISTORY) return '<p class="none">History is not available in this view.</p>';
    const entries = historyFor(id);
    return entries.length ? `<div class="timeline">${entries.map((e) => commitCard(e, id)).join('')}</div>` : '<p class="none">No recorded changes to this component yet.</p>';
  }

  function notFound(what) {
    main.innerHTML = `<div class="vh"><div><h1>Not found</h1><p class="muted">${esc(what)} is not in this catalogue. It may have been renamed; press Rescan.</p><p><a href="#/">Back to the site map</a></p></div></div>`;
  }

  // ---------- command palette ----------
  const pal = { el: $('#palette'), input: $('#pal-input'), results: $('#pal-results'), items: [], sel: 0 };
  const allHooks = [...new Set(comps.flatMap((m) => (m.c.hooks || []).map((h) => h.name)))].sort();
  function highlight(text, terms) {
    const t = terms.find((x) => text.toLowerCase().includes(x));
    if (!t) return esc(text);
    const i = text.toLowerCase().indexOf(t);
    return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + t.length))}</mark>${esc(text.slice(i + t.length))}`;
  }
  function paletteSearch(q) {
    const pq = idx.parse(q);
    const groups = [];
    if (pq.empty) {
      groups.push(['Go to', [
        { href: '#/', icon: ico('route', 'sitemap', 'sm'), label: 'Site map', hint: `${ROUTES.length} routes` },
        { href: '#/components', icon: ico('comp', 'grid', 'sm'), label: 'Components', hint: `${comps.length}` },
        { href: '#/state', icon: ico('store', 'layers', 'sm'), label: 'Global state', hint: `${len(STORES)} stores` },
        { href: '#/health', icon: ico('issue', 'pulse', 'sm'), label: 'Health', hint: `${Object.values(HEALTH.issues || {}).reduce((a, b) => a + b, 0)} issues` },
        { href: '#/health?view=api', icon: ico('api', 'swap', 'sm'), label: 'API map', hint: `${ENDPOINTS.size} endpoints` },
        { href: '#/g', icon: ico('comp', 'graph', 'sm'), label: 'Graph explorer', hint: '' },
      ]]);
      groups.push(['Filters you can type', QUERY_HELP.slice(0, 10).map(([tok, d]) => ({ fill: tok.replace(/:.*/, ':'), icon: ico('var', 'search', 'sm'), label: tok, hint: d }))]);
      return groups;
    }
    const hits = idx.run(pq);
    if (pq.filters.length) groups.push(['Filter', [{ href: `#/components${qs({ q: q.trim() })}`, icon: ico('var', 'search', 'sm'), label: `Show all ${hits.length} matching components`, hint: q.trim() }]]);
    const t = pq.terms.join(' ');
    if (t && !pq.filters.length) groups.push(['Pages', ROUTES.filter((r) => r.toLowerCase().includes(t) || (P[r].component || '').toLowerCase().includes(t)).slice(0, 6).map((r) => ({ href: pageHref(r), icon: ico('route', 'globe', 'sm'), label: highlight(r, pq.terms), hint: P[r].component || '', raw: true }))]);
    groups.push(['Components', hits.slice(0, 12).map((m) => ({ href: compHref(m.id), icon: compIco(m.id), label: highlight(m.name, pq.terms), hint: m.c.file, raw: true }))]);
    if (t && !pq.filters.length) {
      groups.push(['Global state', Object.entries(STORES).filter(([sid, s]) => sid.toLowerCase().includes(t) || (s.state || []).concat(s.actions || []).some((x) => x.toLowerCase().includes(t))).slice(0, 6).map(([sid, s]) => ({ href: storeHref(sid), icon: ico(...storeIconOf(s), 'sm'), label: highlight(s.name, pq.terms), hint: s.kind, raw: true }))]);
      groups.push(['API endpoints', [...ENDPOINTS.entries()].filter(([k]) => k.toLowerCase().includes(t)).slice(0, 6).map(([k, e]) => ({ href: `#/components${qs({ q: `api:${e.target ?? ''}` })}`, icon: ico('api', 'swap', 'sm'), label: highlight(k, pq.terms), hint: `${e.users.length} caller(s)`, raw: true }))]);
      groups.push(['Folders', [...dirIndex.values()].filter((n) => n.path && n.path.toLowerCase().includes(t)).slice(0, 5).map((n) => ({ href: dirHref(n.path), icon: ico('folder', 'folder', 'sm'), label: highlight(n.path, pq.terms), hint: `${n.all.length} components`, raw: true }))]);
      groups.push(['Hooks', allHooks.filter((h) => h.toLowerCase().includes(t)).slice(0, 5).map((h) => ({ href: `#/components${qs({ q: 'hook:' + h })}`, icon: ico('hook', 'anchor', 'sm'), label: highlight(h, pq.terms), hint: `${idx.run('hook:' + h).length} components`, raw: true }))]);
    }
    return groups.filter(([, items]) => items.length);
  }
  function renderPalette() {
    const groups = paletteSearch(pal.input.value);
    pal.items = groups.flatMap(([, items]) => items);
    pal.sel = Math.min(pal.sel, Math.max(0, pal.items.length - 1));
    let i = 0;
    pal.results.innerHTML = groups.length
      ? groups.map(([title, items]) => `<div class="pal-group">${esc(title)}</div>${items.map((it) => {
          const n = i++;
          return `<a class="pal-item${n === pal.sel ? ' sel' : ''}" data-i="${n}" href="${it.href || '#'}">${it.icon}<span class="nm">${it.raw ? it.label : esc(it.label)}</span><span class="hint">${esc(it.hint)}</span></a>`;
        }).join('')}`).join('')
      : `<div class="pal-empty">No results for <code>${esc(pal.input.value)}</code></div>`;
  }
  function openPalette() {
    pal.el.hidden = false;
    pal.input.value = '';
    pal.sel = 0;
    renderPalette();
    pal.input.focus();
  }
  const closePalette = () => (pal.el.hidden = true);
  function choose(n) {
    const it = pal.items[n];
    if (!it) return;
    if (it.fill) {
      pal.input.value = it.fill;
      pal.sel = 0;
      renderPalette();
      return void pal.input.focus();
    }
    closePalette();
    location.hash = it.href;
  }
  pal.input.addEventListener('input', () => ((pal.sel = 0), renderPalette()));
  pal.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      pal.sel = (pal.sel + (e.key === 'ArrowDown' ? 1 : -1) + pal.items.length) % Math.max(1, pal.items.length);
      renderPalette();
      $('.pal-item.sel', pal.results)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(pal.sel);
    }
  });
  pal.results.addEventListener('click', (e) => {
    const a = e.target.closest('.pal-item');
    if (!a) return;
    e.preventDefault();
    choose(Number(a.dataset.i));
  });
  pal.el.addEventListener('click', (e) => e.target === pal.el && closePalette());
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      pal.el.hidden ? openPalette() : closePalette();
    } else if (e.key === 'Escape') {
      if (!pal.el.hidden) closePalette();
      else $('#source-panel').hidden = true;
    }
  });

  // ---------- rescan & toast ----------
  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.innerHTML = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), ms);
  }
  async function rescan() {
    const btn = $('#rescan');
    btn.disabled = true;
    btn.classList.add('spin');
    try {
      const r = await (await fetch('api/rescan', { method: 'POST' })).json();
      if (r.changed) {
        sessionStorage.setItem('rcat:toast', `${I('check', 'sm')} Rescanned: ${r.delta.parsed} file(s) re-parsed${r.commit ? ' · snapshot ' + r.commit.id.slice(0, 8) : ''}`);
        location.reload();
      } else toast(`${I('check', 'sm')} Up to date · ${r.delta.parsed} file(s) re-parsed, ${r.delta.reused} unchanged`);
    } catch {
      toast(`${I('alert', 'sm')} Rescan failed. Is <code>frontdex serve</code> still running?`);
    } finally {
      btn.disabled = false;
      btn.classList.remove('spin');
    }
  }

  // ---------- chrome ----------
  const NAV = [
    ['sitemap', 'Site map', '#/', ['', 'p']],
    ['grid', 'Components', '#/components', ['components', 'f', 'c']],
    ['layers', 'State', '#/state', ['state']],
    ['pulse', 'Health', '#/health', ['health']],
    ['graph', 'Graph', '#/g', ['g']],
    ['history', 'History', '#/history', ['history']],
  ];
  const highCount = HEALTH.issues?.high || 0;
  $('#top-nav').innerHTML = NAV.filter(([, , href]) => href !== '#/history' || HISTORY)
    .map(([icon, label, href, types]) => `<a href="${href}" data-types="${types.join(',')}">${I(icon, 'sm')}<span class="lbl">${label}</span>${label === 'Health' && highCount ? `<span class="badge-count">${highCount}</span>` : ''}</a>`)
    .join('');
  $('#logo').innerHTML = I('logo');
  $('#search-icon').innerHTML = I('search', 'sm');
  $('#menu').innerHTML = I('menu');
  $('#theme').innerHTML = I('moon');
  $$('.side-tabs button')[0].innerHTML = `${I('sitemap', 'sm')} Pages`;
  $$('.side-tabs button')[1].innerHTML = `${I('folder', 'sm')} Files`;
  $('#title').textContent = info.title || 'Catalogue';
  document.title = `${info.title || 'Frontend'} · Catalogue`;
  $('#meta').innerHTML = [info.version && `v${esc(info.version)}`, esc(info.framework || ''), LIVE && '<span class="live" title="Rescans automatically when source files change">auto-update</span>'].filter(Boolean).join(' · ');
  if (ROOT) {
    const btn = $('#rescan');
    btn.hidden = false;
    btn.innerHTML = `${I('refresh', 'sm')}<span class="lbl">Rescan</span>`;
    btn.title = 'Re-parse changed files and refresh';
    btn.addEventListener('click', rescan);
  }
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.set('theme', next);
  });
  $('#open-palette').addEventListener('click', openPalette);
  $('#menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));

  // ---------- routing ----------
  function route() {
    const raw = location.hash.slice(1) || '/';
    const [pathPart, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const segs = pathPart.split('/');
    const type = segs[1] || '';
    const arg = type === 'f' ? segs.slice(2).map(decodeURIComponent).join('/') : decodeURIComponent(segs.slice(2).join('/'));
    current = { type, id: arg, trail: null };
    if (type === 'c') viewComponent(arg, params.get('tab'), params);
    else if (type === 'p') {
      revealTrail({ route: arg, path: [] });
      viewPage(arg, params.get('tab'), params);
    } else if (type === 'components') viewComponents('', params.get('q') || '');
    else if (type === 'f') viewComponents(arg, params.get('q') || '');
    else if (type === 'state') viewState(params);
    else if (type === 'health') viewHealth(params);
    else if (type === 'g') viewGraph(params);
    else if (type === 'history') viewHistory(params.get('q') || '');
    else viewSiteMap();
    wireGraphs();
    $$('#top-nav a').forEach((a) => a.classList.toggle('active', a.dataset.types.split(',').includes(type)));
    if (!params.has('q')) main.scrollTop = 0;
    document.body.classList.remove('nav-open');
    if (type === 'f' && side.tab !== 'files') side.tab = 'files';
    renderTree();
  }

  window.addEventListener('hashchange', route);
  if (LIVE && 'EventSource' in window) new EventSource('api/events').onmessage = () => location.reload();
  const pending = sessionStorage.getItem('rcat:toast');
  if (pending) {
    sessionStorage.removeItem('rcat:toast');
    setTimeout(() => toast(pending), 200);
  }
  route();
})();
