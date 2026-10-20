import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig } from './config.js';
import { diffCatalogues, formatDetail, formatSummary } from './history.js';
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
  const projectRel = path.relative(gitRoot, config.root);
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
      return { id: c.key, ...(c.from && { from: c.from }), change: c.change, details: (c.details ?? []).map(formatDetail), pages, dependents, file: (head.components[c.key] ?? base.components[c.key])?.file };
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
    lines.push(`  ${{ added: '+', removed: '−', changed: '~', renamed: '→' }[c.change]} ${c.from ? `${c.from} → ` : ''}${c.id}${c.details.length ? `  ${c.details.join(' · ')}` : ''}`);
    if (c.pages.length) lines.push(`      pages: ${c.pages.join(', ')}${c.dependents.length ? ` · dependents: ${c.dependents.length}` : ''}`);
  }
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
    out.push('', '| | Component | Change | Pages | Dependents |', '|---|---|---|---|---|');
    for (const c of report.components.slice(0, maxRows)) {
      out.push(`| ${icon[c.change]} | \`${c.id}\` | ${c.details.length ? c.details.map(esc).join('<br>').replace(/\|/g, '\\|') : c.change} | ${c.pages.slice(0, 5).map((p) => `\`${p}\``).join(' ') || '–'}${c.pages.length > 5 ? ` +${c.pages.length - 5}` : ''} | ${c.dependents.length || '–'} |`);
    }
    if (report.components.length > maxRows) out.push(`| | … ${report.components.length - maxRows} more | | | |`);
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
