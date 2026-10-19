import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { componentCard } from './agent-kb.js';
import { similarTo } from './scanner/analyzers/duplicates.js';
import { formatDetail, formatSummary } from './history.js';
import { createHistory, knowledgeDir, scan } from './index.js';

const require = createRequire(import.meta.url);
const { createIndex } = require('./query.cjs');
const RESCAN_THROTTLE_MS = 2000;

/**
 * Knowledge queries shared by the CLI (show, impact, query, …) and the frontdex-mcp server.
 * Each tool takes a plain-object argument and returns Markdown text. Part of the public API: frontdex-mcp depends on it.
 */
/** Last change, recent commit count and top authors of one file, from `git log`; null outside a git checkout. */
function gitActivity(root, file) {
  try {
    const out = execFileSync('git', ['log', '--follow', '--format=%an%x09%aI', '--', file], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const commits = out.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
    if (!commits.length) return null;
    const since = Date.now() - 90 * 864e5;
    const counts = new Map();
    for (const [author] of commits) counts.set(author, (counts.get(author) ?? 0) + 1);
    return {
      last: commits[0][1].slice(0, 10),
      lastAuthor: commits[0][0],
      recent: commits.filter(([, date]) => Date.parse(date) >= since).length,
      authors: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a} (${n})`),
    };
  } catch {
    return null;
  }
}

export function createTools(config) {
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
      const { cat } = refresh().state;
      const match = (k) => !endpoint || k.toLowerCase().includes(String(endpoint).toLowerCase());
      const defined = Object.entries(cat.endpoints ?? {}).filter(([k]) => match(k)).map(([k, e]) => `- \`${k}\` ${e.kind}${e.methods?.length ? ` ${e.methods.join(', ')}` : ''} \`${e.file}\`${e.importedBy ? ` (imported by ${e.importedBy.join(', ')})` : ''}`);
      if (!map.size && !defined.length) return 'No API calls match.';
      const calls = [...map].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => `- \`${k}\`\n${list.map((l) => `    - ${l}`).join('\n')}`);
      return [...(defined.length ? ['Server endpoints defined in this project:', ...defined, ''] : []), ...(calls.length ? ['Calls made by components:', ...calls] : [])].join('\n').trim();
    },
    catalogue_find_existing({ name, props = [] } = {}) {
      const { cat } = refresh().state;
      if (!name) return 'Pass the name of the component you plan to create (and optionally its props).';
      const hits = similarTo(cat.components, { name, props: Array.isArray(props) ? props : String(props).split(',').map((p) => p.trim()).filter(Boolean) });
      if (!hits.length) return `Nothing similar to ${name} exists; creating it is fine.`;
      return [`Existing components similar to ${name}: reuse or extend one of these before creating a new one.`, ...hits.map((h) => `- ${h.id} \`${cat.components[h.id].file}\` score ${h.score} (${h.reasons.join('; ')}); props: ${Object.keys(cat.components[h.id].props ?? {}).join(', ') || 'none'}; used by ${cat.components[h.id].usedBy?.length ?? 0}`)].join('\n');
    },
    catalogue_duplicates({ name } = {}) {
      const { cat } = refresh().state;
      const list = (cat.duplicates ?? []).filter((d) => !name || d.components.some((id) => id === name || cat.components[id]?.name === name));
      if (!list.length) return name ? `No likely duplicates of ${name}.` : 'No likely duplicate components.';
      return list.map((d) => `- ${d.components.join(' ~ ')} (score ${d.score}): ${(d.reasons ?? []).join('; ')}`).join('\n');
    },
    catalogue_tokens({ query } = {}) {
      const { cat } = refresh().state;
      if (!cat.tokens) return 'No design tokens found (CSS custom properties or a Tailwind theme).';
      const q = query?.toLowerCase();
      const defs = Object.entries(cat.tokens.definitions).filter(([k, t]) => !q || k.toLowerCase().includes(q) || t.value.toLowerCase().includes(q));
      const drift = (cat.tokens.drift ?? []).filter((d) => !q || d.token.toLowerCase().includes(q) || d.at.toLowerCase().includes(q) || d.value.toLowerCase().includes(q));
      return [
        `Tokens (${defs.length}):`,
        ...defs.map(([k, t]) => `- ${k} = ${t.value} \`${t.at}\``),
        '',
        drift.length ? `Hard-coded values that should use a token (${drift.length}):` : 'No token drift.',
        ...drift.map((d) => `- ${d.value} at \`${d.at}\` ${d.match === 'exact' ? '=' : '≈'} ${d.token} (defined \`${d.defined}\`): use ${d.use}`),
      ].join('\n');
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
    catalogue_adoption({ name, limit = 20 } = {}) {
      const { idx } = refresh().state;
      const r = resolve(idx, name);
      if (r.error) return r.error;
      const history = createHistory(path.join(knowledgeDir(config), 'history'));
      const snapshots = history.log().slice(-limit);
      if (!snapshots.length) return 'No history yet: adoption needs knowledge-base snapshots (history is on by default).';
      // Usage = components rendering it + pages showing it, per snapshot; a deprecated component should trend to 0.
      const rows = snapshots.map((s) => {
        const c = history.checkout(s.id)?.catalogue.components[r.m.id];
        return { when: s.time.slice(0, 10), git: s.git, usedBy: c?.usedBy?.length ?? 0, pages: c?.pages?.length ?? 0, exists: !!c };
      });
      const status = r.m.c.status === 'deprecated' ? ' (deprecated: usage should go down)' : '';
      return [`# Adoption of ${r.m.name}${status}`, '', '| Snapshot | git | Used by | Pages |', '|---|---|---|---|', ...rows.map((x) => `| ${x.when} | ${x.git ?? '-'} | ${x.exists ? x.usedBy : 'absent'} | ${x.exists ? x.pages : '-'} |`)].join('\n');
    },
    catalogue_owners({ name } = {}) {
      const { idx } = refresh().state;
      const r = resolve(idx, name);
      if (r.error) return r.error;
      const lines = [`# ${r.m.name} \`${r.m.c.file}\``, `- CODEOWNERS: ${r.m.c.codeowners?.join(', ') ?? 'none'}`, `- Tests: ${r.m.c.tests?.join(', ') ?? 'none'} · Stories: ${r.m.c.stories?.join(', ') ?? 'none'}`];
      // Git activity is read live: it changes with every commit, so it is not stored in the catalogue.
      const git = gitActivity(config.root, r.m.c.file);
      if (git) lines.push(`- Last changed ${git.last} by ${git.lastAuthor}; ${git.recent} commit(s) in the last 90 days; top authors: ${git.authors.join(', ')}`);
      else lines.push('- Git history: unavailable (not a git checkout, or the file is untracked)');
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
