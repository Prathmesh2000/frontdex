import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createIndex, LEVELS } = require('./query.cjs');

/*
 * Knowledge base for coding agents, kept apart from the human catalogue:
 *   agent/INDEX.md                         entry point: how to use it, routes, folders, risky shared components
 *   agent/components/<source folder>.md    one card per component, grouped by the folder they live in
 *   agent/graph.json                       compact machine-readable graph
 * Folder cards mirror the source tree so an agent editing src/ui/Button.tsx knows to read components/src/ui.md.
 */

const SHARED_THRESHOLD = 3;
const INDEX_COMPONENT_LIMIT = 40;

export const cardPath = (dir) => `components/${dir || '_root'}.md`;

const code = (s) => `\`${String(s).replace(/`/g, "'")}\``;

export function componentCard(idx, m, { heading = '##' } = {}) {
  const c = m.c;
  const lines = [`${heading} ${c.name}`, `${code(`${c.file}${c.line ? `:${c.line}` : ''}`)} · ${c.kind}${c.rendering ? ` · ${c.rendering} component` : ''} · ${c.export ?? 'none'} export · ${LEVELS[m.level]}${c.status ? ` · ${c.status.toUpperCase()}` : ''}${c.owner ? ` · owner ${c.owner}` : ''}`];
  if (c.description) lines.push('', c.description);
  lines.push('');
  const props = Object.entries(c.props ?? {});
  if (props.length) lines.push(`- Props: ${props.map(([n, p]) => `${code(`${n}${p.required ? '' : '?'}: ${p.type}`)}${p.default != null ? ` = ${code(p.default)}` : ''}`).join(', ')}`);
  const state = Object.entries(c.state ?? {});
  if (state.length) lines.push(`- State: ${state.map(([n, s]) => `${code(n)} (${s.source}${s.initial != null ? `, init ${code(s.initial)}` : ''}${s.setter ? `, set via ${code(s.setter)}` : ''})`).join('; ')}`);
  if (c.context?.length) lines.push(`- Context: ${c.context.map(code).join(', ')}`);
  if (c.refs?.length) lines.push(`- Refs: ${c.refs.map(code).join(', ')}`);
  if (c.hooks?.length) lines.push(`- Hooks: ${c.hooks.map((h) => `${h.name}${h.count ? `×${h.count}` : ''}`).join(', ')}`);
  for (const e of c.lifecycle ?? []) {
    const when = e.deps ? (e.deps.length ? `deps [${e.deps.join(', ')}]` : 'once') : /^use/.test(e.via) ? 'every render' : '';
    lines.push(`- Effect ${code(e.via)}${e.line ? ` L${e.line}` : ''}: ${e.phases.join('+')}${when ? ` (${when})` : ''}${e.calls?.length ? ` → ${e.calls.join(', ')}` : ''}${e.cleanup?.length ? `; cleanup → ${e.cleanup.join(', ')}` : ''}`);
  }
  for (const parent of c.usedBy ?? []) {
    const passed = idx.C[parent]?.passes?.[m.id];
    if (passed?.length) lines.push(`- Props from ${idx.C[parent].name}: ${passed.map((p) => `${p.name}=${p.value}`).join(', ')}`);
  }
  if (c.variables?.length) lines.push(`- Variables: ${c.variables.map((v) => `${v.name}${v.used === false ? ' (UNUSED)' : ''}`).join(', ')}`);
  for (const f of c.functions ?? []) lines.push(`- ${f.kind === 'handler' ? 'Handler' : 'Function'} ${code(`${f.async ? 'async ' : ''}${f.name}(${f.params ?? ''})`)}${f.line ? ` L${f.line}` : ''}${f.sets?.length ? ` sets ${f.sets.join(', ')}` : ''}${f.calls?.length ? ` → ${f.calls.slice(0, 6).join(', ')}` : ''}${f.used === false ? ' (UNUSED)' : ''}`);
  for (const t of c.timers ?? []) lines.push(`- Timer ${code(t.call)}${t.event ? `('${t.event}')` : ''} in ${t.in} (line ${t.line}): ${t.cleared === true ? 'released' : t.cleared === false ? 'NOT RELEASED' : 'one-shot'}`);
  for (const a of c.apiCalls ?? []) lines.push(`- API ${a.method} ${code(a.target ?? '?')} via ${a.via} in ${a.in}${a.line ? ` (line ${a.line})` : ''}`);
  for (const r of c.store?.reads ?? []) lines.push(`- Reads ${r.storeId ?? r.store ?? r.kind}${r.path ? ` ${code(r.path)}` : ''} via ${r.via}`);
  for (const w of c.store?.writes ?? []) lines.push(`- Writes ${w.storeId ?? w.kind}: ${code(w.action)} via ${w.via}${w.in ? ` in ${w.in}` : ''}`);
  for (const v of c.validation ?? []) lines.push(`- Validation (${v.via}): ${v.schema ?? v.field ?? v.fn ?? ''}${v.rules?.length ? ` [${v.rules.join(', ')}]` : ''}`);
  if (c.styles?.classes?.length) lines.push(`- CSS classes: ${c.styles.classes.map((x) => `${x.name}${x.at ? ` (${x.at})` : ''}`).join(', ')}`);
  for (const mo of c.styles?.modules ?? []) lines.push(`- CSS module ${code(mo.file)}: ${mo.classes.map((x) => x.name).join(', ')}`);
  for (const i of c.issues ?? []) lines.push(`- ⚠ ${i.severity.toUpperCase()} ${i.type}${i.line ? ` L${i.line}` : ''}: ${i.message}${i.fix ? `. Fix: ${i.fix}` : ''}`);
  if (c.renders?.length) lines.push(`- Renders: ${c.renders.map((id) => `${idx.C[id]?.name ?? id}${c.passes?.[id]?.length ? `(${c.passes[id].map((p) => p.name).join(', ')})` : ''}`).join(', ')}`);
  if (c.externals?.length) lines.push(`- Libraries: ${c.externals.join(', ')}`);
  lines.push(`- Used by: ${c.usedBy?.length ? c.usedBy.map((id) => idx.C[id]?.name ?? id).join(', ') : 'nothing (unused or entry point)'}`);
  if (c.pages?.length) lines.push(`- Pages: ${c.pages.join(', ')}`);
  const impact = idx.impact(m.id);
  if (impact.components.length || impact.pages.length) {
    lines.push(`- Impact: changing the props/export affects ${impact.components.length} component(s) and ${impact.pages.length} page(s); update every caller listed under "Used by".`);
  }
  return lines.join('\n');
}

function indexMarkdown(cat, idx, files, kb) {
  const info = cat.info;
  const shared = idx.comps.filter((m) => m.usedBy >= SHARED_THRESHOLD || m.pages >= SHARED_THRESHOLD).sort((a, b) => b.usedBy - a.usedBy || b.pages - a.pages).slice(0, INDEX_COMPONENT_LIMIT);
  const pageRows = Object.entries(cat.pages).map(([r, p]) => `| ${code(r)} | ${p.component ?? '?'} | ${code(p.file)} | ${(p.layouts ?? []).join(' > ') || '-'} | ${p.components?.length ?? 0} |`);
  const folderRows = [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dir, list]) => `| ${code(dir || '.')} | ${list.length} | ${code(`${kb}/agent/${cardPath(dir)}`)} | ${list.slice(0, 8).map((m) => m.name).join(', ')}${list.length > 8 ? ', …' : ''} |`);
  return `# Frontend knowledge base: ${info.title}

Generated by ${info.generator}. Do not edit by hand; it is rebuilt by \`npx frontdex scan\`.
${idx.comps.length} components · ${Object.keys(cat.pages).length} pages · routers: ${(info.routers ?? []).join(', ') || 'none'}

## How to use this (coding agents)

1. Before editing a component, read its card in the folder file listed below (the path mirrors the source folder).
2. Check **Used by** and **Impact** before changing props, exports or behaviour. Update every caller in the same change.
3. Prefer reusing an existing component: before creating one, run \`npx frontdex find <PlannedName> --props a,b\` (MCP: \`catalogue_find_existing\`), or search with \`npx frontdex query "<terms or filters>"\` (e.g. \`uses:Button\`, \`hook:useQuery\`, \`prop:onClose\`, \`is:shared\`). Use design tokens instead of hard-coded colors and sizes (see Design tokens below).
4. After editing components or routes, run \`npx frontdex scan\` (incremental, usually under a second) so this knowledge stays current.
5. When the MCP server \`frontdex\` is available, its tools (\`catalogue_search\`, \`catalogue_component\`, \`catalogue_impact\`, \`catalogue_page\`, \`catalogue_rescan\`) return the same data.

## Pages

| Route | Root component | File | Layouts | Components |
|---|---|---|---|---|
${pageRows.join('\n') || '| - | - | - | - | - |'}

## Folders

| Folder | Components | Card file | Contains |
|---|---|---|---|
${folderRows.join('\n')}

## Shared components (changes here have wide impact)

${shared.length ? shared.map((m) => `- **${m.name}** ${code(m.c.file)}: used by ${m.usedBy}, on ${m.pages} page(s)`).join('\n') : '_None used in 3+ places._'}

## Global state

| Store | Kind | File | State | Actions | Readers | Writers |
|---|---|---|---|---|---|---|
${Object.entries(cat.stores ?? {}).map(([id, s]) => `| ${id} | ${s.kind} | ${code(`${s.file}:${s.line}`)} | ${(s.state ?? []).join(', ') || '-'} | ${(s.actions ?? []).join(', ') || '-'} | ${s.readers.length} | ${s.writers.length} |`).join('\n') || '| - | - | - | - | - | - | - |'}

## API endpoints

${apiMap(idx).join('\n') || '_No API calls detected._'}
${cat.endpoints ? `
## Server endpoints (defined in this project)

| Key | Kind | Methods | File |
|---|---|---|---|
${Object.entries(cat.endpoints).map(([k, e]) => `| ${code(k)} | ${e.kind} | ${(e.methods ?? []).join(', ') || '-'} | ${code(e.file)} |`).join('\n')}
` : ''}
${cat.tokens ? `
## Design tokens

${Object.entries(cat.tokens.definitions).slice(0, 60).map(([k, t]) => `- ${code(k)} = ${code(t.value)}`).join('\n')}${Object.keys(cat.tokens.definitions).length > 60 ? '\n- …' : ''}
${cat.tokens.drift?.length ? `\n${cat.tokens.drift.length} hard-coded value(s) match a token; prefer the token. Examples:\n${cat.tokens.drift.slice(0, 10).map((d) => `- ${code(d.value)} at ${code(d.at)} → ${code(d.use)}`).join('\n')}\n` : ''}` : ''}${cat.duplicates?.length ? `
## Possible duplicate components

${cat.duplicates.slice(0, 20).map((d) => `- ${d.components.join(' ~ ')} (${(d.reasons ?? []).join('; ')})`).join('\n')}
` : ''}
## Health

${healthLines(cat, idx).join('\n')}
`;
}

function apiMap(idx) {
  const map = new Map();
  for (const m of idx.comps) for (const a of m.c.apiCalls ?? []) {
    const key = `${a.method} ${a.target ?? '?'}`;
    (map.get(key) ?? map.set(key, new Set()).get(key)).add(m.name);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([k, set]) => `- ${code(k)} ← ${[...set].join(', ')}`);
}

function healthLines(cat, idx) {
  const h = cat.health ?? {};
  const out = [`Issues: ${Object.entries(h.issues ?? {}).map(([s, n]) => `${n} ${s}`).join(', ') || 'none'}. Use \`catalogue_health\` for the full list.`];
  for (const m of idx.comps) for (const i of m.c.issues ?? []) if (i.severity === 'high') out.push(`- HIGH ${i.type}: ${m.name} ${code(`${m.c.file}${i.line ? `:${i.line}` : ''}`)}: ${i.message}`);
  if (h.unusedComponents?.length) out.push(`- Unused components: ${h.unusedComponents.join(', ')}`);
  if (h.unusedFiles?.length) out.push(`- Unused files: ${h.unusedFiles.join(', ')}`);
  if (h.unusedExports?.length) out.push(`- Exports never imported: ${h.unusedExports.map((e) => `${e.name} (${e.file})`).join(', ')}`);
  return out;
}

/**
 * Writes the agent knowledge base. Only files whose content changed are rewritten, and stale folder cards are removed.
 * `written` (optional Map, kept by a watch session) remembers what was last written, so unchanged cards are not re-read.
 * `kb` is the knowledge folder relative to the project root, used in the paths the cards print.
 */
export function writeAgentKnowledge(dir, cat, written = null, { kb = '.frontdex' } = {}) {
  const idx = createIndex(cat);
  const files = new Map();
  for (const m of idx.comps) (files.get(m.dir) ?? files.set(m.dir, []).get(m.dir)).push(m);

  const outputs = new Map();
  outputs.set('INDEX.md', indexMarkdown(cat, idx, files, kb));
  for (const [folder, list] of files) {
    list.sort((a, b) => (a.c.line ?? 0) - (b.c.line ?? 0) || a.c.file.localeCompare(b.c.file));
    outputs.set(cardPath(folder), `# ${folder || '(project root)'}\n\n${list.length} component(s). Index: \`${kb}/agent/INDEX.md\`\n\n${list.map((m) => componentCard(idx, m)).join('\n\n')}\n`);
  }
  outputs.set(
    'graph.json',
    JSON.stringify(
      {
        generator: cat.info.generator,
        components: Object.fromEntries(idx.comps.map((m) => [m.id, { name: m.name, file: m.c.file, line: m.c.line, kind: m.c.kind, props: Object.keys(m.c.props ?? {}), state: Object.keys(m.c.state ?? {}), renders: m.c.renders ?? [], usedBy: m.c.usedBy ?? [], pages: m.c.pages ?? [] }])),
        pages: Object.fromEntries(Object.entries(cat.pages).map(([r, p]) => [r, { file: p.file, component: p.component, layouts: p.layouts ?? [], components: p.components ?? [] }])),
      },
      null,
      1,
    ) + '\n',
  );

  // A warm memo already knows every card on disk, so stale ones are removed from it instead of walking the folder.
  const warm = written?.size > 0;
  let count = 0;
  for (const [rel, content] of outputs) {
    const file = path.join(dir, rel);
    if (written?.get(rel) === content || (!written?.has(rel) && fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content)) {
      written?.set(rel, content);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    written?.set(rel, content);
    count++;
  }
  if (warm) {
    for (const rel of written.keys()) {
      if (outputs.has(rel)) continue;
      fs.rmSync(path.join(dir, rel), { force: true });
      written.delete(rel);
    }
  } else {
    const keep = new Set([...outputs.keys()].map((rel) => path.join(dir, rel)));
    const componentsDir = path.join(dir, 'components');
    for (const file of fs.existsSync(componentsDir) ? fs.readdirSync(componentsDir, { recursive: true }) : []) {
      const abs = path.join(componentsDir, file);
      if (abs.endsWith('.md') && !keep.has(abs)) fs.rmSync(abs);
    }
  }
  return { written: count, total: outputs.size };
}
