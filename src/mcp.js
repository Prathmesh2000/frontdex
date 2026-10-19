import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import { componentCard } from './agent-kb.js';
import { formatDetail, formatSummary } from './history.js';
import { createHistory, knowledgeDir, scan } from './index.js';

const require = createRequire(import.meta.url);
const { createIndex, QUERY_HELP } = require('./query.cjs');
const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const MODERN = '2026-07-28';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const RESCAN_THROTTLE_MS = 2000;

const INSTRUCTIONS = `Knowledge base of this project's React/Next.js components and pages.
Use catalogue_search before creating a component (reuse beats duplication), catalogue_component / catalogue_dataflow before editing one,
catalogue_impact before changing props/exports, catalogue_health to avoid introducing leaks or dead code, catalogue_state / catalogue_api / catalogue_styles
to reuse existing stores, endpoints and CSS, and catalogue_rescan after editing components or routes.`;

const str = (description) => ({ type: 'string', description });
const TOOLS = [
  {
    name: 'catalogue_search',
    description: `Search components by name/text and filters. Filters: ${QUERY_HELP.map(([t]) => t).join(', ')}. Returns name, file, kind and usage counts.`,
    inputSchema: { type: 'object', properties: { query: str('e.g. "button", "uses:Modal", "hook:useQuery is:shared"'), limit: { type: 'number', description: 'max results (default 25)' } }, required: ['query'] },
  },
  {
    name: 'catalogue_component',
    description: 'Full card for one component: file, props with types/defaults, state, context, hooks, effects (mount/update/unmount), what it renders, who renders it, pages, impact.',
    inputSchema: { type: 'object', properties: { name: str('component name or id (Name@path when names collide)') }, required: ['name'] },
  },
  {
    name: 'catalogue_impact',
    description: 'Blast radius of changing a component: every component that renders it directly or transitively, and every page it appears on, with file paths to update.',
    inputSchema: { type: 'object', properties: { name: str('component name or id') }, required: ['name'] },
  },
  {
    name: 'catalogue_page',
    description: 'A route: file, root component, layouts, params and the full component tree. Omit route to list all pages.',
    inputSchema: { type: 'object', properties: { route: str('e.g. "/", "/products/[id]", "/users/:id"') } },
  },
  {
    name: 'catalogue_overview',
    description: 'Project summary: counts, routers, folders, most shared components. Start here in an unfamiliar codebase.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'catalogue_dataflow',
    description: 'How data moves through one component: props received from each parent (with values), store/context reads, local state, effects, API calls, store writes, and props passed to each child.',
    inputSchema: { type: 'object', properties: { name: str('component name or id') }, required: ['name'] },
  },
  {
    name: 'catalogue_health',
    description: 'Diagnostics: memory leaks (uncleared intervals/listeners/subscriptions), render loops, unsafe async state updates, stale effect deps, unused variables/props/state/functions/imports, unused components/files/exports, deprecated usage. Each with file:line and a fix.',
    inputSchema: { type: 'object', properties: { severity: str('high | medium | low | info (default: all)'), type: str('e.g. memory-leak, unused-variable') } },
  },
  {
    name: 'catalogue_state',
    description: 'Global state map: Redux slices, React contexts and zustand stores with their state keys, actions, providers, and which components read or write them. Pass a store to focus (e.g. "redux:cart", "AuthContext").',
    inputSchema: { type: 'object', properties: { store: str('optional store id or name') } },
  },
  {
    name: 'catalogue_api',
    description: 'Every API call in the frontend grouped by endpoint (method, client: fetch/axios/useSWR/service, component, where it runs). Optionally filter by endpoint text.',
    inputSchema: { type: 'object', properties: { endpoint: str('optional filter, e.g. "/orders"') } },
  },
  {
    name: 'catalogue_styles',
    description: 'CSS usage: for a class name, where it is defined (file:line) and which components use it; for a component, its classes, CSS modules and stylesheets.',
    inputSchema: { type: 'object', properties: { className: str('CSS class to look up'), name: str('component name') } },
  },
  {
    name: 'catalogue_rescan',
    description: 'Incrementally rescan the source after you edit components or routes, and report what changed.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'catalogue_history',
    description: 'Recent knowledge-base commits (git-like), optionally only those touching one component.',
    inputSchema: { type: 'object', properties: { name: str('optional component name or id'), limit: { type: 'number', description: 'default 10' } } },
  },
];

export function createMcpHandlers(config) {
  let state = null;
  let lastScan = 0;

  const refresh = (force = false) => {
    if (!force && state && Date.now() - lastScan < RESCAN_THROTTLE_MS) return { state, result: null };
    const result = scan(config);
    lastScan = Date.now();
    state = { cat: result.catalogue, idx: createIndex(result.catalogue) };
    return { state, result };
  };

  const resolve = (idx, name) => {
    const hits = idx.find(name);
    if (hits.length === 1) return { m: hits[0] };
    if (hits.length > 1) return { error: `"${name}" is ambiguous; use one of: ${hits.map((h) => h.id).join(', ')}` };
    const close = idx.run(name).slice(0, 5).map((m) => m.name);
    return { error: `No component "${name}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''}` };
  };

  const tools = {
    catalogue_search({ query, limit = 25 }) {
      const { idx } = refresh().state;
      const hits = idx.run(String(query ?? ''));
      if (!hits.length) return `No components match \`${query}\`.`;
      return [`${hits.length} match(es) for \`${query}\`${hits.length > limit ? ` (showing ${limit})` : ''}:`, ...hits.slice(0, limit).map((m) => `- ${m.name} (${m.c.kind}) \`${m.c.file}${m.c.line ? `:${m.c.line}` : ''}\` · props ${m.props} · state ${m.state} · used by ${m.usedBy} · pages ${m.pages}${m.c.description ? ` — ${m.c.description.split('\n')[0]}` : ''}`)].join('\n');
    },
    catalogue_component({ name }) {
      const { idx } = refresh().state;
      const r = resolve(idx, name);
      return r.error ?? componentCard(idx, r.m, { heading: '#' });
    },
    catalogue_impact({ name }) {
      const { idx } = refresh().state;
      const r = resolve(idx, name);
      if (r.error) return r.error;
      const { components, pages } = idx.impact(r.m.id);
      const direct = r.m.c.usedBy ?? [];
      const line = (id) => `- ${idx.C[id]?.name ?? id} \`${idx.C[id]?.file}\`${direct.includes(id) ? ' (direct: update its usage)' : ''}`;
      return [`# Impact of changing ${r.m.name}`, `\`${r.m.c.file}\``, '', `## ${components.length} dependent component(s)`, ...(components.length ? components.map(line) : ['- none']), '', `## ${pages.length} page(s)`, ...(pages.length ? pages.map((p) => `- ${p}`) : ['- none'])].join('\n');
    },
    catalogue_page({ route }) {
      const { cat } = refresh().state;
      if (!route) return Object.entries(cat.pages).map(([r, p]) => `- ${r} → ${p.component ?? '?'} \`${p.file}\` (${p.router})`).join('\n') || 'No pages detected.';
      const p = cat.pages[route];
      if (!p) return `No page "${route}". Known: ${Object.keys(cat.pages).join(', ')}`;
      return [`# ${route}`, `\`${p.file}\` · ${p.router}`, `- Root component: ${p.component ?? 'unresolved'}`, `- Layouts: ${(p.layouts ?? []).join(' > ') || 'none'}`, `- Params: ${(p.params ?? []).join(', ') || 'none'}`, `- Components (${(p.components ?? []).length}): ${(p.components ?? []).join(', ')}`].join('\n');
    },
    catalogue_overview() {
      const { cat, idx } = refresh().state;
      const file = path.join(knowledgeDir(config), 'agent', 'INDEX.md');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : `${idx.comps.length} components, ${Object.keys(cat.pages).length} pages.`;
    },
    catalogue_dataflow({ name }) {
      const { idx } = refresh().state;
      const r = resolve(idx, name);
      if (r.error) return r.error;
      const c = r.m.c;
      const nm = (id) => idx.C[id]?.name ?? id;
      const out = [`# Data flow: ${c.name}`, `\`${c.file}:${c.line}\``, '', '## In'];
      for (const p of c.usedBy ?? []) out.push(`- from ${nm(p)}: ${(idx.C[p]?.passes?.[r.m.id] ?? []).map((x) => `${x.name}=${x.value}`).join(', ') || '(no props)'}`);
      for (const s of c.store?.reads ?? []) out.push(`- reads ${s.storeId ?? s.store ?? s.kind}${s.path ? ` \`${s.path}\`` : ''} via ${s.via}`);
      out.push('', '## Inside');
      for (const [k, s] of Object.entries(c.state ?? {})) out.push(`- state ${k} = ${s.initial ?? '?'} (${s.source}${s.setter ? `, ${s.setter}` : ''})`);
      for (const e of c.lifecycle ?? []) out.push(`- ${e.via} [${e.phases.join('+')}]${e.deps ? ` deps [${e.deps.join(', ')}]` : ''}${e.calls?.length ? ` → ${e.calls.join(', ')}` : ''}`);
      for (const f of c.functions ?? []) if (f.sets?.length || f.calls?.length) out.push(`- ${f.name}() → ${[...(f.sets ?? []).map((s) => `sets ${s}`), ...(f.calls ?? []).slice(0, 5)].join(', ')}`);
      out.push('', '## Out');
      for (const a of c.apiCalls ?? []) out.push(`- API ${a.method} ${a.target ?? '?'} (${a.via}, ${a.in})`);
      for (const w of c.store?.writes ?? []) out.push(`- dispatch ${w.action} → ${w.storeId ?? 'store'} (${w.in ?? w.via})`);
      for (const [child, props] of Object.entries(c.passes ?? {})) out.push(`- to ${nm(child)}: ${props.map((p) => `${p.name}=${p.value}`).join(', ')}`);
      return out.join('\n');
    },
    catalogue_health({ severity, type } = {}) {
      const { cat, idx } = refresh().state;
      const rows = [];
      for (const m of idx.comps) {
        for (const i of m.c.issues ?? []) {
          if ((severity && i.severity !== severity) || (type && !i.type.includes(type))) continue;
          rows.push(`- [${i.severity}] ${i.type} · ${m.name} \`${m.c.file}${i.line ? `:${i.line}` : ''}\`: ${i.message}${i.fix ? ` → fix: ${i.fix}` : ''}`);
        }
      }
      const h = cat.health ?? {};
      const dead = [];
      if (!severity || severity === 'low') {
        if (!type || type.includes('unused')) {
          (h.unusedComponents ?? []).forEach((id) => dead.push(`- unused component ${id} \`${idx.C[id]?.file}\``));
          (h.unusedFiles ?? []).forEach((f) => dead.push(`- unused file \`${f}\``));
          (h.unusedExports ?? []).forEach((e) => dead.push(`- export never imported: ${e.name} \`${e.file}\``));
          (h.unusedImports ?? []).forEach((u) => dead.push(`- unused import ${u.name} from ${u.source} \`${u.file}:${u.line}\``));
        }
      }
      return [`Issues: ${Object.entries(h.issues ?? {}).map(([s, n]) => `${n} ${s}`).join(', ')}`, '', ...(rows.length ? rows : ['No component issues match.']), ...(dead.length ? ['', '## Dead code', ...dead] : [])].join('\n');
    },
    catalogue_state({ store } = {}) {
      const { cat, idx } = refresh().state;
      const nm = (id) => idx.C[id]?.name ?? id;
      const entries = Object.entries(cat.stores ?? {}).filter(([id, s]) => !store || id === store || s.name.toLowerCase() === String(store).toLowerCase() || id.toLowerCase().includes(String(store).toLowerCase()));
      if (!entries.length) return store ? `No store "${store}". Known: ${Object.keys(cat.stores ?? {}).join(', ')}` : 'No global state detected.';
      return entries
        .map(([id, s]) => [`## ${id} (${s.kind})`, `\`${s.file}:${s.line}\``, s.state?.length ? `- state: ${s.state.join(', ')}` : null, s.actions?.length ? `- actions: ${s.actions.join(', ')}` : null, s.thunks?.length ? `- thunks: ${s.thunks.join(', ')}` : null, s.providers ? `- provided by: ${s.providers.map(nm).join(', ') || 'none found'}` : null, `- read by: ${s.readers.map(nm).join(', ') || 'none'}`, `- written by: ${s.writers.map(nm).join(', ') || 'none'}`].filter(Boolean).join('\n'))
        .join('\n\n');
    },
    catalogue_api({ endpoint } = {}) {
      const { idx } = refresh().state;
      const map = new Map();
      for (const m of idx.comps) {
        for (const a of m.c.apiCalls ?? []) {
          const key = `${a.method} ${a.target ?? '?'}`;
          if (endpoint && !key.toLowerCase().includes(String(endpoint).toLowerCase())) continue;
          (map.get(key) ?? map.set(key, []).get(key)).push(`${m.name} (${a.via}, ${a.in}) \`${m.c.file}${a.line ? `:${a.line}` : ''}\``);
        }
      }
      if (!map.size) return 'No API calls match.';
      return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => `- \`${k}\`\n${list.map((l) => `    - ${l}`).join('\n')}`).join('\n');
    },
    catalogue_styles({ className, name } = {}) {
      const { cat, idx } = refresh().state;
      if (name) {
        const r = resolve(idx, name);
        if (r.error) return r.error;
        const st = r.m.c.styles;
        if (!st) return `${r.m.name} uses no CSS classes.`;
        return [`# Styles: ${r.m.name}`, ...(st.classes ?? []).map((c) => `- .${c.name} → ${c.at ?? 'no rule in project CSS (utility/global framework class)'}`), ...(st.modules ?? []).flatMap((mo) => [`- module \`${mo.file}\``, ...mo.classes.map((c) => `    - .${c.name} → ${c.at ?? 'missing in module'}`)]), ...(st.sheets ?? []).map((s) => `- imports \`${s}\``)].join('\n');
      }
      if (!className) return Object.entries(cat.styles ?? {}).map(([f, s]) => `- \`${f}\` ${s.module ? '(module) ' : ''}${s.classes} classes${s.importedBy ? `, imported by ${s.importedBy.join(', ')}` : ''}`).join('\n') || 'No stylesheets.';
      const users = idx.comps.filter((m) => (m.c.styles?.classes ?? []).some((c) => c.name === className) || (m.c.styles?.modules ?? []).some((mo) => mo.classes.some((c) => c.name === className)));
      const at = users.flatMap((m) => [...(m.c.styles.classes ?? []), ...(m.c.styles.modules ?? []).flatMap((mo) => mo.classes)]).find((c) => c.name === className && c.at)?.at;
      return [`.${className}: defined at ${at ?? 'no project CSS rule found'}`, ...users.map((m) => `- used by ${m.name} \`${m.c.file}\``)].join('\n');
    },
    catalogue_rescan() {
      const { result } = refresh(true);
      const d = result.delta;
      const lines = [`Scanned ${result.stats.files} files: ${d.parsed} re-parsed, ${d.reused} unchanged, ${d.removed.length} removed.`];
      if (result.commit) {
        lines.push(`Catalogue changed: ${formatSummary(result.commit.summary)}`);
        result.commit.changes.slice(0, 30).forEach((c) => lines.push(`- ${c.change} ${c.key}${c.details ? `: ${c.details.map(formatDetail).join('; ')}` : ''}`));
      } else if (!result.changed) lines.push('No catalogue changes.');
      result.warnings.forEach((w) => lines.push(`⚠ ${w}`));
      return lines.join('\n');
    },
    catalogue_history({ name, limit = 10 }) {
      const { idx } = refresh().state;
      let entries = createHistory(path.join(knowledgeDir(config), 'history')).log().reverse();
      let id;
      if (name) {
        const r = resolve(idx, name);
        if (r.error) return r.error;
        id = r.m.id;
        entries = entries.filter((e) => e.changes.some((c) => c.key === id));
      }
      if (!entries.length) return 'No history yet.';
      return entries
        .slice(0, limit)
        .map((e) => {
          const head = `- ${e.id} ${e.time.slice(0, 16).replace('T', ' ')}${e.git ? ` (git ${e.git})` : ''} ${formatSummary(e.summary)}${e.message ? ` — ${e.message}` : ''}`;
          const own = id ? e.changes.filter((c) => c.key === id).map((c) => `    ${c.change}${c.details ? `: ${c.details.map(formatDetail).join('; ')}` : ''}`) : [];
          return [head, ...own].join('\n');
        })
        .join('\n');
    },
  };

  return { tools, refresh };
}

/** Stdio MCP server speaking both the stateless 2026-07-28 revision and the initialize-handshake revisions. */
export function startMcpServer(config, { input = process.stdin, output = process.stdout } = {}) {
  const { tools } = createMcpHandlers(config);
  const send = (msg) => output.write(JSON.stringify(msg) + '\n');
  const serverInfo = { name: 'react-catalogue', version: PKG.version };

  const handle = (msg) => {
    const { id, method, params = {} } = msg;
    const isRequest = id !== undefined && id !== null;
    const modern = params._meta?.[META_VERSION];
    const reply = (result) => isRequest && send({ jsonrpc: '2.0', id, result: modern ? { resultType: 'complete', ...result } : result });
    const fail = (code, message, data) => isRequest && send({ jsonrpc: '2.0', id, error: { code, message, ...(data && { data }) } });

    if (modern && modern !== MODERN && !LEGACY.includes(modern)) return fail(-32022, 'Unsupported protocol version', { supported: [MODERN, ...LEGACY], requested: modern });
    switch (method) {
      case 'initialize':
        return reply({ protocolVersion: LEGACY.includes(params.protocolVersion) ? params.protocolVersion : LEGACY[0], capabilities: { tools: { listChanged: false } }, serverInfo, instructions: INSTRUCTIONS });
      case 'server/discover':
        return reply({ supportedVersions: [MODERN, ...LEGACY], capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': serverInfo }, instructions: INSTRUCTIONS });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const tool = tools[params.name];
        if (!tool) return fail(-32602, `Unknown tool: ${params.name}`);
        try {
          return reply({ content: [{ type: 'text', text: tool(params.arguments ?? {}) }], isError: false });
        } catch (err) {
          return reply({ content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true });
        }
      }
      default:
        if (method?.startsWith('notifications/')) return;
        return fail(-32601, `Method not found: ${method}`);
    }
  };

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    (Array.isArray(msg) ? msg : [msg]).forEach(handle);
  });
  return new Promise((resolve) => rl.on('close', resolve));
}
