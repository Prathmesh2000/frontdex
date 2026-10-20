import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig } from './config.js';
import { diffCatalogues, formatDetail, formatSummary, keyed, withoutLines } from './history.js';
import { scanProject } from './scanner/graph.js';
import { assembleShards, readCatalogue, shardDir } from './spec.js';

/*
 * Pull-request reports: what a change does to the frontend, between two git refs.
 *
 *   base ref ──► catalogue (committed YAML at that ref, or a scan of a temporary worktree)
 *   head     ──► catalogue (working tree scan, or another ref)
 *            ──► diffCatalogues + blast radius (pages and dependents) + issues introduced
 *            ──► text / JSON / Markdown PR comment
 */

export const COMMENT_MARKER = '<!-- frontdex-pr-report -->';
const SEVERITY_ORDER = ['high', 'medium', 'low', 'info'];

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }).trim();

/**
 * The catalogue as it was at `ref`. Uses the YAML committed at that ref when there is one (fast; `frontdex check` in CI
 * keeps it current), unless `scan` is forced; otherwise checks the ref out into a temporary worktree and scans it.
 */
export function catalogueAtRef(config, ref, { scan = false } = {}) {
  const gitRoot = git(config.root, ['rev-parse', '--show-toplevel']);
  // Refs can come from HTTP (/api/diff): never let one be read as a git option, and use only the resolved commit.
  if (typeof ref !== 'string' || !ref || ref.startsWith('-') || ref.length > 200) throw new Error(`Invalid git ref: ${ref}`);
  const sha = git(gitRoot, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
  // Ask git, not path.relative: on Windows the root can be an 8.3 short path (C:\Users\RUNNER~1) while git reports the long one.
  const projectRel = git(config.root, ['rev-parse', '--show-prefix']).replace(/\/$/, '');
  if (!scan) {
    const yamlRel = path.join(projectRel, config.output).split(path.sep).join('/');
    const show = (rel) => YAML.parse(git(gitRoot, ['show', `${sha}:${rel}`]));
    try {
      return { catalogue: show(yamlRel), source: `${config.output} at ${ref}` };
    } catch {
      // Not committed at that ref, or committed sharded: try the folder, then fall through to a scan.
    }
    try {
      const dir = shardDir(yamlRel);
      return { catalogue: assembleShards(show(`${dir}/index.yaml`), (s) => show(`${dir}/${s}`)), source: `${dir}/ at ${ref}` };
    } catch {
      // Not committed at that ref: fall through to a scan.
    }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frontdex-ref-'));
  try {
    git(gitRoot, ['worktree', 'add', '--detach', '--force', tmp, sha]);
    const refConfig = loadConfig(path.join(tmp, projectRel));
    // The catalogue committed at that ref (if any) keeps IDs as they were recorded, so the diff matches by stable ID.
    const previous = readCatalogue(path.resolve(refConfig.root, refConfig.output));
    return { catalogue: scanProject(refConfig, { previous }).catalogue, source: `scan of ${ref}` };
  } finally {
    try {
      git(gitRoot, ['worktree', 'remove', '--force', tmp]);
    } catch {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

/** Pages a component reaches, directly or through everything that renders it. */
function reach(catalogue, id) {
  const pages = new Set();
  const dependents = new Set();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    const c = catalogue.components[cur];
    if (!c) continue;
    for (const p of c.pages ?? []) pages.add(p);
    for (const parent of c.usedBy ?? []) if (!dependents.has(parent) && parent !== id) dependents.add(parent), queue.push(parent);
  }
  return { pages: [...pages].sort(), dependents: [...dependents].sort() };
}

const issueKey = (i) => `${i.type}|${i.message}`;

const CELL = 90;
const clip = (s) => (s.length > CELL ? `${s.slice(0, CELL - 1)}…` : s);
/** One value in a diff cell, written the way a reviewer reads it in code (props as `?: type = default`). */
function show(field, v) {
  if (v === undefined) return undefined;
  if (field === 'props' && v && typeof v === 'object') return clip(`${v.required ? '' : '?'}: ${v.type ?? 'unknown'}${v.default !== undefined ? ` = ${v.default}` : ''}`);
  if (field === 'state' && v && typeof v === 'object') return clip(`${v.source ?? 'state'}${v.initial !== undefined ? ` = ${v.initial}` : ''}`);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return clip(v.join(' | '));
  return clip(typeof v === 'string' ? v : JSON.stringify(withoutLines(v)));
}

/**
 * A component change field by field, with values: [{ field, from, to }] for plain values, or
 * [{ field, added: [{ key, after }], removed: [{ key, before }], modified: [{ key, before, after }] }] for maps and lists
 * (props, state, children, conditions …). The same keys as the history diff, so entries line up with it.
 */
function fieldChanges(before = {}, after = {}, details = []) {
  return details.map((d) => {
    if ('from' in d || 'to' in d) return { field: d.field, from: show(d.field, d.from), to: show(d.field, d.to) };
    const a = keyed(before[d.field]);
    const b = keyed(after[d.field]);
    const modified = (d.modified ?? []).filter((k) => k !== 'order');
    // In plain lists (renders, navigatesTo) the value is the entry itself: showing it twice is noise.
    const value = (key, v) => (v === key ? undefined : v);
    return {
      field: d.field,
      ...(d.added && { added: d.added.map((key) => ({ key, after: value(key, show(d.field, b.get(key))) })) }),
      ...(d.removed && { removed: d.removed.map((key) => ({ key, before: value(key, show(d.field, a.get(key))) })) }),
      ...(modified.length && { modified: modified.map((key) => ({ key, before: show(d.field, a.get(key)), after: show(d.field, b.get(key)) })) }),
      ...(d.modified?.includes('order') && { reordered: true }),
    };
  });
}

/** "props +1 −1 ~1 · renders +2" for a component's fields. */
export function fieldSummary(fields) {
  return fields
    .map((f) => ('from' in f || 'to' in f ? `${f.field} changed` : [f.field, f.added && `+${f.added.length}`, f.removed && `−${f.removed.length}`, f.modified && `~${f.modified.length}`, f.reordered && 'reordered'].filter(Boolean).join(' ')))
    .join(' · ');
}

/** Diff + blast radius + issues introduced by `head` relative to `base`. */
export function buildReport(base, head, { baseLabel = 'base', headLabel = 'head' } = {}) {
  // Issues are reported on their own (new/fixed); ownership and test files are metadata, not a change to the UI.
  const { summary, changes } = diffCatalogues(base, head, { ignoreComponentFields: ['issues', 'codeowners', 'tests', 'stories', 'examples'] });
  const affectedPages = new Set();
  const components = changes
    .filter((c) => c.kind === 'components')
    .map((c) => {
      // Removed components are traced in the base catalogue: those pages lost something.
      const { pages, dependents } = reach(c.change === 'removed' ? base : head, c.key);
      pages.forEach((p) => affectedPages.add(p));
      const fields = fieldChanges(base.components[c.from ?? c.key], head.components[c.key], c.details ?? []);
      return { id: c.key, ...(c.from && { from: c.from }), change: c.change, details: (c.details ?? []).map(formatDetail), fields, pages, dependents, file: (head.components[c.key] ?? base.components[c.key])?.file };
    });
  for (const c of changes) if (c.kind === 'pages') affectedPages.add(c.key);

  // A component whose ID changed (file moved) brings its issues along; they are neither new nor fixed.
  const movedFrom = new Map(changes.filter((c) => c.change === 'renamed').map((c) => [c.key, c.from]));
  const movedTo = new Map([...movedFrom].map(([to, from]) => [from, to]));
  const newIssues = [];
  for (const [id, comp] of Object.entries(head.components)) {
    const before = new Set(((base.components[id] ?? base.components[movedFrom.get(id)])?.issues ?? []).map(issueKey));
    for (const i of comp.issues ?? []) if (!before.has(issueKey(i))) newIssues.push({ component: id, file: comp.file, ...i });
  }
  newIssues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const fixedIssues = Object.entries(base.components).reduce((n, [id, comp]) => {
    const after = new Set(((head.components[id] ?? head.components[movedTo.get(id)])?.issues ?? []).map(issueKey));
    return n + (comp.issues ?? []).filter((i) => !after.has(issueKey(i))).length;
  }, 0);
  const pairKey = (d) => d.components.join(' ~ ');
  const baseDupes = new Set((base.duplicates ?? []).map(pairKey));
  const newDuplicates = (head.duplicates ?? []).filter((d) => !baseDupes.has(pairKey(d)));
  const baseDrift = new Set((base.tokens?.drift ?? []).map((d) => `${d.at}|${d.value}`));
  const newDrift = (head.tokens?.drift ?? []).filter((d) => !baseDrift.has(`${d.at}|${d.value}`));

  return {
    base: baseLabel,
    head: headLabel,
    summary,
    components,
    pages: changes.filter((c) => c.kind === 'pages').map((c) => ({ route: c.key, change: c.change, details: (c.details ?? []).map(formatDetail) })),
    endpoints: changes.filter((c) => c.kind === 'endpoints').map((c) => ({ key: c.key, change: c.change })),
    affectedPages: [...affectedPages].sort(),
    newIssues,
    fixedIssues,
    newDuplicates,
    newDrift,
  };
}

export function formatText(report) {
  const lines = [`frontdex diff ${report.base} → ${report.head}: ${formatSummary(report.summary)}`];
  for (const c of report.components) {
    lines.push('', `${{ added: '+', removed: '−', changed: '~', renamed: '→' }[c.change]} ${c.from ? `${c.from} → ` : ''}${c.id}${c.file ? `  ${c.file}` : ''}`);
    // One line per changed entry, field name once, so a reviewer (or an agent) sees exactly what moved.
    for (const f of c.fields ?? []) {
      const rows = 'from' in f || 'to' in f ? [`~ ${f.from ?? '∅'} → ${f.to ?? '∅'}`] : [...(f.added ?? []).map((e) => `+ ${e.key}${e.after ? ` ${e.after}` : ''}`), ...(f.removed ?? []).map((e) => `− ${e.key}`), ...(f.modified ?? []).map((e) => `~ ${e.key}: ${e.before ?? '∅'} → ${e.after ?? '∅'}`), ...(f.reordered ? ['~ order'] : [])];
      rows.forEach((row, i) => lines.push(`    ${(i ? '' : f.field).padEnd(13)}${row}`));
    }
    if (c.pages.length || c.dependents.length) lines.push(`    ${'reaches'.padEnd(13)}${c.pages.length ? c.pages.join(', ') : 'no page'}${c.dependents.length ? ` · ${c.dependents.length} dependent component(s)` : ''}`);
  }
  if (report.components.length) lines.push('');
  for (const p of report.pages) lines.push(`  ${{ added: '+', removed: '−', changed: '~' }[p.change]} page ${p.route}${p.details.length ? `  ${p.details.join(' · ')}` : ''}`);
  for (const e of report.endpoints) lines.push(`  ${{ added: '+', removed: '−', changed: '~' }[e.change]} endpoint ${e.key}`);
  lines.push(`Pages affected: ${report.affectedPages.length ? report.affectedPages.join(', ') : 'none'}`);
  lines.push(`New issues: ${report.newIssues.length}${report.fixedIssues ? ` · fixed: ${report.fixedIssues}` : ''}`);
  for (const i of report.newIssues.slice(0, 20)) lines.push(`  ${i.severity.toUpperCase()} ${i.type} · ${i.component} \`${i.file}${i.line ? `:${i.line}` : ''}\`: ${i.message}`);
  for (const d of report.newDuplicates) lines.push(`  possible duplicate: ${d.components.join(' ~ ')} (${(d.reasons ?? []).join('; ')})`);
  for (const d of report.newDrift) lines.push(`  token drift: ${d.value} at ${d.at} → ${d.use}`);
  return lines.join('\n');
}

/** Markdown for a sticky PR comment; the marker lets the action find and update its previous comment. */
// Messages contain markup like <select>; GitHub would render it as HTML.
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Table cells: escaped markup, and pipes that would end the cell.
const cell = (t) => (t === undefined || t === '' ? '' : `\`${String(t).replace(/`/g, "'").replace(/\|/g, '\\|')}\``);
const MAX_GRAPH_PAGES = 6;

/**
 * A Mermaid flowchart GitHub renders inline: each changed component (coloured by kind of change, with its field
 * summary) linked to the pages it reaches. Gives a reviewer the blast radius before the details.
 */
function impactGraph(components) {
  const label = (s) => String(s).replace(/"/g, '#quot;');
  const pageIds = new Map();
  const lines = ['```mermaid', 'flowchart LR'];
  components.forEach((c, i) => {
    const summary = fieldSummary(c.fields ?? []);
    const deps = c.dependents.length ? `<br/>${c.dependents.length} dependent(s)` : '';
    lines.push(`  c${i}["${label(c.id)}${summary ? `<br/><small>${label(summary)}</small>` : ''}${deps}"]:::${c.change}`);
    for (const p of c.pages.slice(0, MAX_GRAPH_PAGES)) {
      if (!pageIds.has(p)) pageIds.set(p, `p${pageIds.size}`), lines.push(`  ${pageIds.get(p)}(["${label(p)}"]):::page`);
      lines.push(`  c${i} --> ${pageIds.get(p)}`);
    }
    if (c.pages.length > MAX_GRAPH_PAGES) lines.push(`  c${i} --> more${i}(["+${c.pages.length - MAX_GRAPH_PAGES} more page(s)"]):::page`);
  });
  lines.push(
    '  classDef changed fill:#fef3c7,stroke:#d97706,color:#111',
    '  classDef added fill:#dcfce7,stroke:#16a34a,color:#111',
    '  classDef removed fill:#fee2e2,stroke:#dc2626,color:#111',
    '  classDef renamed fill:#e0f2fe,stroke:#0284c7,color:#111',
    '  classDef page fill:#eef2ff,stroke:#4f46e5,color:#111',
    '```',
  );
  return lines;
}

/** A collapsible section per component: what changed, entry by entry, before and after. */
function componentBlock(c, icon) {
  const summary = fieldSummary(c.fields ?? []) || c.change;
  const reach = `${c.pages.length} page(s)${c.dependents.length ? `, ${c.dependents.length} dependent(s)` : ''}`;
  const out = [`<details><summary>${icon} <code>${esc(c.from ? `${c.from} → ${c.id}` : c.id)}</code> · ${esc(summary)} · reaches ${reach}</summary>`, ''];
  if (c.file) out.push(`\`${c.file}\``, '');
  const rows = [];
  for (const f of c.fields ?? []) {
    if ('from' in f || 'to' in f) rows.push([f.field, '✏️', '', f.from, f.to]);
    for (const e of f.added ?? []) rows.push([f.field, '➕', e.key, '', e.after]);
    for (const e of f.removed ?? []) rows.push([f.field, '➖', e.key, e.before, '']);
    for (const e of f.modified ?? []) rows.push([f.field, '✏️', e.key, e.before, e.after]);
    if (f.reordered) rows.push([f.field, '↕️', 'order', '', '']);
  }
  if (rows.length) {
    out.push('| Field | | Entry | Before | After |', '|---|---|---|---|---|');
    for (const [field, mark, key, before, after] of rows) out.push(`| ${field} | ${mark} | ${cell(key)} | ${cell(before)} | ${cell(after)} |`);
    out.push('');
  }
  if (c.pages.length) out.push(`Pages: ${c.pages.map((p) => `\`${p}\``).join(' ')}`, '');
  out.push('</details>');
  return out;
}

export function formatMarkdown(report, { maxRows = 30 } = {}) {
  const high = report.newIssues.filter((i) => i.severity === 'high').length;
  const icon = { added: '🆕', removed: '🗑️', changed: '✏️', renamed: '🚚' };
  const out = [
    COMMENT_MARKER,
    '### frontdex: frontend impact of this PR',
    '',
    `**${formatSummary(report.summary)}** · **${report.affectedPages.length} page(s) affected** · ${report.newIssues.length} new issue(s)${high ? ` (**${high} high**)` : ''}${report.fixedIssues ? ` · ${report.fixedIssues} fixed` : ''}`,
  ];
  if (report.components.length) {
    out.push('', ...impactGraph(report.components.slice(0, maxRows)));
    for (const c of report.components.slice(0, maxRows)) out.push('', ...componentBlock(c, icon[c.change]));
    if (report.components.length > maxRows) out.push('', `_… ${report.components.length - maxRows} more component(s); run \`npx frontdex diff\` for all of them._`);
  }
  if (report.pages.length || report.endpoints.length) {
    out.push('', '**Routes and endpoints**', '');
    for (const p of report.pages) out.push(`- ${icon[p.change]} page \`${p.route}\`${p.details.length ? `: ${esc(p.details.join('; '))}` : ''}`);
    for (const e of report.endpoints) out.push(`- ${icon[e.change]} endpoint \`${e.key}\``);
  }
  if (report.newIssues.length) {
    out.push('', '<details><summary><b>New issues</b></summary>', '');
    for (const i of report.newIssues.slice(0, maxRows)) out.push(`- **${i.severity}** \`${i.type}\` in \`${i.component}\` (\`${i.file}${i.line ? `:${i.line}` : ''}\`): ${esc(i.message)}${i.fix ? `. _Fix: ${esc(i.fix)}_` : ''}`);
    out.push('', '</details>');
  }
  if (report.newDuplicates.length || report.newDrift.length) {
    out.push('', '<details><summary><b>Design system</b></summary>', '');
    for (const d of report.newDuplicates) out.push(`- Possible duplicate: \`${d.components.join('` ~ `')}\` (${esc((d.reasons ?? []).join('; '))})`);
    for (const d of report.newDrift) out.push(`- Hard-coded \`${d.value}\` at \`${d.at}\` matches \`${d.token}\`: use \`${d.use}\``);
    out.push('', '</details>');
  }
  out.push('', `<sub>${report.base} → ${report.head} · generated by frontdex</sub>`);
  return out.join('\n');
}
