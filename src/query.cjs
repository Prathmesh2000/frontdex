// Shared by Node (CLI, MCP server) and the browser UI, which loads it as a plain <script>; keep it dependency-free ES2020.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatalogueQuery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LEVELS = ['trivial', 'simple', 'moderate', 'complex', 'heavy'];
  const len = (x) => (Array.isArray(x) ? x.length : x ? Object.keys(x).length : 0);
  const dirOf = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');

  const QUERY_HELP = [
    ['kind:class', 'function · class · memo · forwardRef'],
    ['hook:useEffect', 'calls this hook'],
    ['prop:onClick', 'has a prop'],
    ['state:loading', 'has a state field'],
    ['ctx:Theme', 'reads a context'],
    ['uses:Button', 'renders a component'],
    ['in:Header', 'rendered by a component'],
    ['page:/checkout', 'appears on a route'],
    ['dir:components/ui', 'folder path contains'],
    ['ext:next/image', 'uses a library component'],
    ['tag:forms', 'has a tag'],
    ['owner:web-core', 'owned by'],
    ['api:/orders', 'calls an endpoint / API client'],
    ['store:cart', 'reads or writes a Redux slice, context or zustand store'],
    ['issue:memory-leak', 'has a diagnostic (memory-leak, render-loop, unused-variable, …)'],
    ['timer:interval', 'interval · timeout · listener · subscription · observer · socket'],
    ['class:btn', 'uses a CSS class'],
    ['var:total', 'declares a local variable'],
    ['fn:handleSubmit', 'declares a function / handler'],
    ['has:effects', 'state · props · effects · context · refs · children · docs · api · store · validation · issues · leaks · timers'],
    ['is:unused', 'unused · shared · heavy · page · layout · leaf · deprecated · undocumented · leaky'],
    ['-is:memo', 'prefix any filter with - to negate'],
  ];

  function enrich(id, c) {
    const props = len(c.props);
    const state = len(c.state);
    const effects = len(c.lifecycle);
    const hooks = (c.hooks || []).reduce((n, h) => n + (h.count || 1), 0);
    const renders = len(c.renders);
    const score = props + state * 2 + effects * 2 + hooks * 0.5 + renders * 0.5;
    const issues = c.issues || [];
    return {
      issues: issues.length,
      leaks: issues.filter((i) => i.type === 'memory-leak').length,
      worst: ['high', 'medium', 'low', 'info'].find((s) => issues.some((i) => i.severity === s)) || null,
      id,
      c,
      name: c.name,
      dir: dirOf(c.file),
      props,
      state,
      effects,
      hooks,
      renders,
      usedBy: len(c.usedBy),
      pages: len(c.pages),
      score,
      level: score < 3 ? 0 : score < 7 ? 1 : score < 12 ? 2 : score < 20 ? 3 : 4,
      nameL: c.name.toLowerCase(),
      hay: [c.name, c.file, c.description].concat(c.tags || []).join(' ').toLowerCase(),
    };
  }

  function parseQuery(q, keys) {
    const terms = [];
    const filters = [];
    for (const tok of String(q || '').trim().split(/\s+/).filter(Boolean)) {
      const m = tok.match(/^(-?)(\w+):(.+)$/);
      if (m && keys.includes(m[2].toLowerCase())) filters.push({ neg: !!m[1], key: m[2].toLowerCase(), val: m[3].toLowerCase() });
      else terms.push(tok.toLowerCase());
    }
    return { terms, filters, empty: !terms.length && !filters.length };
  }

  function fuzzy(s, t) {
    let i = 0;
    for (const ch of s) if (ch === t[i] && ++i === t.length) return true;
    return false;
  }

  function textScore(m, terms) {
    let s = 0;
    for (const t of terms) {
      if (m.nameL === t) s += 100;
      else if (m.nameL.startsWith(t)) s += 60;
      else if (m.nameL.includes(t)) s += 40;
      else if (m.hay.includes(t)) s += 15;
      else if (fuzzy(m.nameL, t)) s += 5;
      else return -1;
    }
    return s;
  }

  function createIndex(cat) {
    const C = (cat && cat.components) || {};
    const P = (cat && cat.pages) || {};
    const comps = Object.keys(C).map((id) => enrich(id, C[id]));
    const byId = new Map(comps.map((m) => [m.id, m]));
    const nameCount = new Map();
    comps.forEach((m) => nameCount.set(m.name, (nameCount.get(m.name) || 0) + 1));
    const pageRoots = new Set(Object.values(P).map((p) => p.component).filter(Boolean));
    const layoutIds = new Set([].concat(...Object.values(P).map((p) => p.layouts || [])));
    const anyIncl = (arr, v) => (arr || []).some((x) => String(x).toLowerCase().includes(v));
    const namesOf = (ids) => (ids || []).map((id) => (C[id] ? C[id].name : id));

    const FILTERS = {
      kind: (m, v) => m.c.kind.toLowerCase().startsWith(v),
      hook: (m, v) => anyIncl((m.c.hooks || []).map((h) => h.name), v),
      prop: (m, v) => anyIncl(Object.keys(m.c.props || {}), v),
      state: (m, v) => anyIncl(Object.keys(m.c.state || {}), v),
      ctx: (m, v) => anyIncl(m.c.context, v),
      tag: (m, v) => anyIncl(m.c.tags, v),
      ext: (m, v) => anyIncl(m.c.externals, v),
      uses: (m, v) => anyIncl(namesOf(m.c.renders), v),
      in: (m, v) => anyIncl(namesOf(m.c.usedBy), v),
      page: (m, v) => (m.c.pages || []).some((r) => r.toLowerCase().startsWith(v)),
      dir: (m, v) => m.dir.toLowerCase().includes(v),
      owner: (m, v) => (m.c.owner || '').toLowerCase().includes(v),
      api: (m, v) => (m.c.apiCalls || []).some((a) => `${a.via} ${a.method} ${a.target || ''}`.toLowerCase().includes(v)),
      store: (m, v) => {
        const s = m.c.store || {};
        return (s.reads || []).concat(s.writes || []).some((x) => [x.storeId, x.path, x.action, x.store].join(' ').toLowerCase().includes(v));
      },
      issue: (m, v) => (m.c.issues || []).some((i) => i.type.includes(v) || i.severity === v),
      timer: (m, v) => (m.c.timers || []).some((t) => `${t.type} ${t.call} ${t.event || ''}`.toLowerCase().includes(v)),
      class: (m, v) => {
        const st = m.c.styles || {};
        return (st.classes || []).some((c) => c.name.toLowerCase().includes(v)) || (st.modules || []).some((mo) => mo.classes.some((c) => c.name.toLowerCase().includes(v)));
      },
      var: (m, v) => (m.c.variables || []).some((x) => x.name.toLowerCase().includes(v)) || Object.keys(m.c.state || {}).some((x) => x.toLowerCase().includes(v)),
      fn: (m, v) => (m.c.functions || []).some((x) => x.name.toLowerCase().includes(v)),
      has: (m, v) =>
        ({
          state: m.state,
          props: m.props,
          effects: m.effects,
          lifecycle: m.effects,
          hooks: m.hooks,
          context: len(m.c.context),
          refs: len(m.c.refs),
          tags: len(m.c.tags),
          children: m.renders,
          docs: m.c.description ? 1 : 0,
          api: len(m.c.apiCalls),
          store: m.c.store ? 1 : 0,
          validation: len(m.c.validation),
          issues: len(m.c.issues),
          leaks: m.leaks,
          timers: len(m.c.timers),
        })[v] > 0,
      is: (m, v) =>
        ({
          unused: !m.usedBy && !m.pages,
          deprecated: m.c.status === 'deprecated',
          page: pageRoots.has(m.id),
          layout: layoutIds.has(m.id),
          leaf: !m.renders,
          shared: m.usedBy > 1,
          heavy: m.level >= 3,
          class: m.c.kind === 'class',
          memo: m.c.kind === 'memo',
          undocumented: !m.c.description,
          leaky: m.leaks > 0,
        })[v] === true,
    };
    const keys = Object.keys(FILTERS);

    function run(q, list) {
      list = list || comps;
      const pq = typeof q === 'string' ? parseQuery(q, keys) : q;
      if (pq.empty) return list;
      const out = [];
      for (const m of list) {
        if (!pq.filters.every((f) => FILTERS[f.key](m, f.val) !== f.neg)) continue;
        const s = textScore(m, pq.terms);
        if (s >= 0) out.push([s, m]);
      }
      if (pq.terms.length) out.sort((a, b) => b[0] - a[0]);
      return out.map((x) => x[1]);
    }

    /**
     * Resolves a component by id, old id (catalogue `aliases`, kept when a component moved), exact name, or
     * case-insensitive name; returns all candidates when a name is ambiguous.
     */
    function find(nameOrId) {
      if (byId.has(nameOrId)) return [byId.get(nameOrId)];
      const aliased = cat && cat.aliases && Object.prototype.hasOwnProperty.call(cat.aliases, nameOrId) && byId.get(cat.aliases[nameOrId]);
      if (aliased) return [aliased];
      const exact = comps.filter((m) => m.name === nameOrId);
      if (exact.length) return exact;
      const lower = String(nameOrId).toLowerCase();
      return comps.filter((m) => m.nameL === lower);
    }

    /** Everything that transitively renders `id`, plus the pages it reaches: the blast radius of changing it. */
    function impact(id) {
      const seen = new Set();
      const queue = [...((C[id] && C[id].usedBy) || [])];
      while (queue.length) {
        const next = queue.shift();
        if (seen.has(next) || next === id) continue;
        seen.add(next);
        queue.push(...((C[next] && C[next].usedBy) || []));
      }
      return { components: [...seen], pages: (C[id] && C[id].pages) || [] };
    }

    return { C, P, comps, byId, nameCount, pageRoots, layoutIds, keys, run, find, impact, parse: (q) => parseQuery(q, keys) };
  }

  return { createIndex, LEVELS, QUERY_HELP, len, dirOf };
});
