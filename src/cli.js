import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { installAgents, runHook, TARGETS } from './agents.js';
import { buildReport, catalogueAtRef, formatMarkdown, formatText } from './ci.js';
import { diagnose, formatDiagnosis } from './doctor.js';
import { applyFixes, planFixes } from './fix.js';
import { formatDetail, formatSummary } from './history.js';
import { upgradeProject } from './config.js';
import { createHistory, createTools, initConfig, knowledgeDir, loadConfig, readCatalogue, scan, upgradeCatalogue, validateCatalogue } from './index.js';
import { buildSite, startServer } from './server.js';
import { startWatcher } from './watch.js';

const HELP = `frontdex (fdx): a living index of your frontend: components, pages, state, APIs, health

Usage: frontdex <command> [options]   (aliases: fdx, rcat)

Setup
  init [--auto-update]     Create frontdex.config.json
  doctor                   What was detected (frameworks, workspaces, routers, compilers, agents) and what is missing
  upgrade                  Move a react-catalogue project to frontdex file names (config, YAML, knowledge folder),
                           then migrate the catalogue: stable IDs, aliases for changed IDs, sharding ("shard" option)
  agents [--targets a,b]   Wire coding agents (rules, MCP, hooks). Targets: ${TARGETS.join(', ')}
         [--no-hooks] [--no-mcp] [--remove]

Knowledge base
  scan [--full] [-m msg]   Incremental rescan (only changed files are re-parsed). --full ignores the cache
  watch                    Keep the knowledge base updated while you code (what autoUpdate runs)
  check                    Exit 1 if the catalogue is out of date (CI / pre-commit)
  history [id] [-n 20]     Git-like log of knowledge-base changes; pass an id for the full diff
  validate [file]          Validate the catalogue YAML against the CatalogueSpec schema

Explore
  serve | start [-p 4400]  Open the catalogue UI (auto-updates when autoUpdate is on or with -w)
  build [-o dir]           Export the UI as a static site
  query "<filters>"        Search components, e.g. "uses:Button is:shared"
  show <Component>         Component card (props, state, effects, usage)
  impact <Component>       Everything that breaks if this component changes
  dataflow <Component>     Props in (per parent) → state/store/effects → API calls, dispatches, props out
  fix [--tokens] [--dry-run]  Safe automatic fixes: remove unused imports; --tokens also replaces exact token
                           matches in stylesheets with var(--token)
  health [type] [--severity high] [--strict]   Leaks, render loops, stale deps, dead code (--strict: exit 1 on high)
  state [store]            Redux slices / contexts / zustand stores with readers and writers
  api [endpoint]           Every API call grouped by endpoint
  find <Name> [--props a,b] Existing components like one you plan to create (run before creating)
  dupes [Component]        Components that look like duplicates of each other
  tokens [query]           Design tokens and hard-coded values that should use them
  hooks [name]             Custom hooks: file, what they read and call, which components use them
  owners <Component>       CODEOWNERS, tests/stories and live git activity for a component
  adoption <Component>     Usage of a component across knowledge-base snapshots

Change review (CI)
  diff [base] [head]       What a change does to the frontend: components/pages/endpoints changed, pages affected,
                           issues introduced. base defaults to HEAD, head to the working tree. --json | --markdown,
                           --scan (scan refs instead of reading their committed YAML), --fail-on high|medium|low
  pr-comment [base]        Markdown report for a pull-request comment (base defaults to origin/$GITHUB_BASE_REF)

Agents
  mcp                      Run the MCP server over stdio (needs the frontdex-mcp package; registered by "frontdex agents")
  hook <post-edit|session-start> [--format claude|cursor]   Agent hook entry point

Options
  -C, --cwd <dir>          Project root (default: current directory)
  --json                   Machine-readable output (query commands, scan, check, history, diff, doctor)
  -v, --version            Print the frontdex version
`;

export async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: 'string', short: 'C' },
      out: { type: 'string', short: 'o' },
      port: { type: 'string', short: 'p' },
      watch: { type: 'boolean', short: 'w' },
      'no-watch': { type: 'boolean' },
      'no-generate': { type: 'boolean' },
      full: { type: 'boolean' },
      message: { type: 'string', short: 'm' },
      limit: { type: 'string', short: 'n' },
      targets: { type: 'string' },
      'no-hooks': { type: 'boolean' },
      'no-mcp': { type: 'boolean' },
      remove: { type: 'boolean' },
      format: { type: 'string' },
      'auto-update': { type: 'boolean' },
      'parent-pid': { type: 'string' },
      severity: { type: 'string' },
      props: { type: 'string' },
      json: { type: 'boolean' },
      markdown: { type: 'boolean' },
      scan: { type: 'boolean' },
      'fail-on': { type: 'string' },
      'dry-run': { type: 'boolean' },
      tokens: { type: 'boolean' },
      strict: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const [command, arg] = positionals;
  if (values.version || command === 'version') return void console.log(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  if (values.help || !command) return void console.log(HELP);

  const root = path.resolve(values.cwd ?? process.cwd());
  const config = loadConfig(root, command === 'scan' || command === 'generate' ? { output: values.out } : {});
  const rel = (f) => path.relative(process.cwd(), f) || '.';

  if (config.legacy && ['init', 'scan', 'generate', 'watch', 'serve', 'start', 'check'].includes(command) && !values.quiet) {
    console.error('• This project uses react-catalogue file names. Run "frontdex upgrade" to move to frontdex.config.json, frontdex.yaml and .frontdex/.');
  }

  // --json: the structured form of every query command (the same data the MCP tools render as text).
  const DATA_ARGS = {
    query: () => ({ query: positionals.slice(1).join(' ') }),
    show: () => ({ name: arg }),
    impact: () => ({ name: arg }),
    dataflow: () => ({ name: arg }),
    health: () => ({ severity: values.severity, type: arg }),
    state: () => ({ store: arg }),
    api: () => ({ endpoint: arg }),
    find: () => ({ name: arg, props: values.props ?? '' }),
    dupes: () => ({ name: arg }),
    tokens: () => ({ query: arg }),
    hooks: () => ({ name: arg }),
    owners: () => ({ name: arg }),
    adoption: () => ({ name: arg }),
  };
  if (values.json && DATA_ARGS[command]) {
    const out = createTools(config).data[command](DATA_ARGS[command]());
    console.log(JSON.stringify(out, null, 2));
    if (command === 'health' && values.strict && (out.issues ?? []).some((i) => i.severity === 'high')) process.exitCode = 1;
    return;
  }

  switch (command) {
    case 'fix': {
      const fixes = planFixes(config, scan(config, { dryRun: true }).catalogue, { tokens: values.tokens });
      const done = values['dry-run'] ? fixes : applyFixes(fixes);
      if (values.json) return void console.log(JSON.stringify(done.map(({ file, kind, line, from, to }) => ({ file, kind, line, from, to })), null, 2));
      if (!done.length) return void console.log('✔ nothing to fix');
      for (const f of done) console.log(`${values['dry-run'] ? '•' : '✔'} ${f.file}:${f.line}  ${f.kind}: ${f.from} → ${f.to}`);
      if (!values['dry-run']) scan(config, { message: 'frontdex fix' });
      return;
    }
    case 'doctor': {
      const checks = diagnose(config);
      console.log(values.json ? JSON.stringify(checks, null, 2) : formatDiagnosis(checks));
      if (checks.some((c) => c.status === 'error')) process.exitCode = 1;
      return;
    }
    case 'upgrade': {
      const moves = upgradeProject(root);
      moves.forEach(([from, to]) => console.log(`✔ ${from} → ${to}`));
      const migrated = upgradeCatalogue(loadConfig(root));
      if (migrated) {
        const aliases = Object.entries(migrated.aliases);
        console.log(`✔ catalogue: stable IDs${aliases.length ? `, ${aliases.length} alias(es) for changed IDs` : ''} · ${migrated.sharded ? `sharded into ${rel(migrated.shardDir)}/` : 'single file'}`);
        aliases.forEach(([from, to]) => console.log(`  ${from} → ${to}`));
      }
      if (moves.length) console.log('  next: "frontdex agents" to refresh agent rules, MCP entries and hooks under the new name');
      else if (!migrated) console.log('✔ already using frontdex file names');
      return;
    }
    case 'init': {
      const { file, created } = initConfig(root, { autoUpdate: values['auto-update'] });
      console.log(created ? `✔ created ${rel(file)}` : `• ${rel(file)} already exists`);
      if (created) console.log('  next: "frontdex scan", then "frontdex agents" to wire coding agents');
      return;
    }
    case 'scan':
    case 'generate': {
      const t = performance.now();
      const r = scan(config, { full: values.full, message: values.message });
      if (values.json) return void console.log(JSON.stringify({ changed: r.changed, stats: r.stats, delta: r.delta, warnings: r.warnings, commit: r.commit, timings: r.timings }, null, 2));
      r.warnings.forEach((w) => console.warn(`⚠ ${w}`));
      const d = r.delta;
      console.log(`✔ ${r.stats.components} components, ${r.stats.pages} pages · ${d.parsed} file(s) parsed, ${d.reused} unchanged${d.removed.length ? `, ${d.removed.length} removed` : ''} · ${Math.round(performance.now() - t)} ms`);
      if (r.commit) {
        console.log(`  history ${r.commit.id}: ${formatSummary(r.commit.summary)}`);
        if (r.commit.parent) printChanges(r.commit.changes, 15);
      } else if (!r.changed) console.log('  no changes');
      return;
    }
    case 'watch': {
      const log = values.quiet ? () => {} : (m) => console.log(`[catalogue] ${m}`);
      const first = scan(config);
      log(`watching ${rel(root)} · ${first.stats.components} components${first.commit ? ` · ${formatSummary(first.commit.summary)}` : ''}`);
      startWatcher(config, { log });
      if (values['parent-pid']) {
        const ppid = Number(values['parent-pid']);
        setInterval(() => {
          try {
            process.kill(ppid, 0);
          } catch {
            process.exit(0);
          }
        }, 2000).unref();
      }
      return;
    }
    case 'check': {
      const r = scan(config, { dryRun: true });
      if (values.json) console.log(JSON.stringify({ upToDate: !r.changed, changed: [...r.delta.added, ...r.delta.changed], removed: r.delta.removed }, null, 2));
      else if (!r.changed) return void console.log('✔ catalogue is up to date');
      if (!r.changed) return;
      console.error(`✖ catalogue is out of date (${[...r.delta.added, ...r.delta.changed].length} changed, ${r.delta.removed.length} removed file(s)). Run: npx frontdex scan`);
      process.exitCode = 1;
      return;
    }
    case 'history': {
      const history = createHistory(path.join(knowledgeDir(config), 'history'));
      const entries = history.log();
      if (values.json) return void console.log(JSON.stringify(arg ? entries.find((x) => x.id.startsWith(arg)) ?? null : entries.reverse().slice(0, Number(values.limit ?? 20)), null, 2));
      if (!entries.length) return void console.log('No history yet. Run "frontdex scan".');
      if (arg) {
        const e = entries.find((x) => x.id.startsWith(arg));
        if (!e) throw new Error(`No history entry "${arg}"`);
        console.log(`${e.id}  ${e.time}${e.git ? `  git ${e.git}` : ''}${e.parent ? `  parent ${e.parent}` : ''}\n${e.message ? `${e.message}\n` : ''}${formatSummary(e.summary)}\n`);
        printChanges(e.changes, Infinity);
        if (e.truncated) console.log('  … (list truncated)');
        return;
      }
      for (const e of entries.reverse().slice(0, Number(values.limit ?? 20))) {
        console.log(`${e.id}  ${e.time.slice(0, 16).replace('T', ' ')}  ${(e.git ?? '').padEnd(8)} ${formatSummary(e.summary)}${e.message ? `  — ${e.message}` : ''}`);
      }
      return;
    }
    case 'validate': {
      const file = path.resolve(root, arg ?? config.output);
      const catalogue = readCatalogue(file);
      if (!catalogue) throw new Error(`File not found: ${file}`);
      const { valid, errors } = validateCatalogue(catalogue);
      if (valid) return void console.log(`✔ ${rel(file)} is valid CatalogueSpec ${catalogue.catalogue}`);
      errors.forEach((e) => console.error(`✖ ${e}`));
      process.exitCode = 1;
      return;
    }
    case 'serve':
    case 'start': {
      const port = Number(values.port ?? config.port);
      const watch = values['no-watch'] ? false : values.watch || config.autoUpdate;
      await startServer(config, { port, watch, regenerate: !values['no-generate'] });
      console.log(`✔ catalogue running at http://localhost:${port}${watch ? '  (auto-update on)' : ''}`);
      return;
    }
    case 'build': {
      const { catalogue } = scan(config);
      const out = path.resolve(root, values.out ?? 'frontdex-site');
      buildSite(config, catalogue, out);
      console.log(`✔ static catalogue written to ${rel(out)}/`);
      return;
    }
    case 'query':
    case 'show':
    case 'impact':
    case 'dataflow': {
      if (!arg) throw new Error(`Usage: frontdex ${command} ${command === 'query' ? '"<filters>"' : '<Component>'}`);
      const { tools } = createTools(config);
      const tool = { query: 'catalogue_search', show: 'catalogue_component', impact: 'catalogue_impact', dataflow: 'catalogue_dataflow' }[command];
      console.log(tools[tool](command === 'query' ? { query: positionals.slice(1).join(' '), limit: Number(values.limit ?? 50) } : { name: arg }));
      return;
    }
    case 'health':
    case 'state':
    case 'api': {
      const { tools } = createTools(config);
      if (command === 'health') {
        console.log(tools.catalogue_health({ severity: values.severity, type: arg }));
        if (values.strict && (scan(config, { dryRun: true }).catalogue.health?.issues?.high ?? 0) > 0) process.exitCode = 1;
      } else if (command === 'state') console.log(tools.catalogue_state({ store: arg }));
      else console.log(tools.catalogue_api({ endpoint: arg }));
      return;
    }
    case 'diff':
    case 'pr-comment': {
      const baseRef = arg ?? (command === 'pr-comment' && process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD');
      const headRef = command === 'diff' ? positionals[2] : undefined;
      const base = catalogueAtRef(config, baseRef, { scan: values.scan });
      const head = headRef ? catalogueAtRef(config, headRef, { scan: values.scan }) : { catalogue: scan(config, { dryRun: true }).catalogue, source: 'working tree' };
      const report = buildReport(base.catalogue, head.catalogue, { baseLabel: baseRef, headLabel: headRef ?? 'working tree' });
      if (values.json) console.log(JSON.stringify(report, null, 2));
      else if (values.markdown || command === 'pr-comment') console.log(formatMarkdown(report));
      else console.log(formatText(report));
      const failOn = values['fail-on'];
      if (failOn) {
        const levels = ['high', 'medium', 'low'].slice(0, ['high', 'medium', 'low'].indexOf(failOn) + 1);
        if (report.newIssues.some((i) => levels.includes(i.severity))) process.exitCode = 1;
      }
      return;
    }
    case 'hooks':
      return void console.log(createTools(config).tools.catalogue_hooks({ name: arg }));
    case 'owners':
    case 'adoption': {
      if (!arg) throw new Error(`Usage: frontdex ${command} <Component>`);
      const { tools } = createTools(config);
      console.log(command === 'owners' ? tools.catalogue_owners({ name: arg }) : tools.catalogue_adoption({ name: arg }));
      return;
    }
    case 'find':
    case 'dupes':
    case 'tokens': {
      const { tools } = createTools(config);
      if (command === 'find') {
        if (!arg) throw new Error('Usage: frontdex find <PlannedComponentName> [--props a,b,c]');
        console.log(tools.catalogue_find_existing({ name: arg, props: values.props ?? '' }));
      } else if (command === 'dupes') console.log(tools.catalogue_duplicates({ name: arg }));
      else console.log(tools.catalogue_tokens({ query: arg }));
      return;
    }
    case 'agents': {
      const targets = values.targets ? values.targets.split(',').map((t) => t.trim()) : TARGETS;
      const unknown = targets.filter((t) => !TARGETS.includes(t));
      if (unknown.length) throw new Error(`Unknown target(s): ${unknown.join(', ')}. Use: ${TARGETS.join(', ')}`);
      if (!values.remove && !fs.existsSync(path.join(knowledgeDir(config), 'agent', 'INDEX.md'))) scan(config);
      const { results, notes } = installAgents(config, { targets, remove: values.remove, hooks: !values['no-hooks'], mcp: !values['no-mcp'] });
      for (const r of results) console.log(`${r.status === 'unchanged' ? '•' : '✔'} ${r.status.padEnd(9)} ${r.file}`);
      notes.forEach((n) => console.log(`\nℹ ${n}`));
      return;
    }
    case 'mcp': {
      // The server lives in the separate frontdex-mcp package; resolve it from the project first so its peer dependency is this project's copy.
      const entry = [path.join(config.root, 'package.json'), import.meta.url].map((from) => {
        try {
          return createRequire(from).resolve('frontdex-mcp');
        } catch {
          return null;
        }
      }).find(Boolean);
      if (!entry) {
        console.error('The MCP server is a separate package. Install it next to frontdex:\n  npm install --save-dev frontdex-mcp');
        process.exitCode = 1;
        return;
      }
      const { startMcpServer } = await import(pathToFileURL(entry).href);
      return startMcpServer(config);
    }
    case 'hook':
      return runHook(config, arg, { format: values.format });
    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

function printChanges(changes, max) {
  for (const c of changes.slice(0, max)) {
    const sign = { added: '+', removed: '−', changed: '~', renamed: '→' }[c.change];
    console.log(`  ${sign} ${c.kind === 'pages' ? 'page ' : ''}${c.from ? `${c.from} → ` : ''}${c.key}${c.details ? `  ${c.details.map(formatDetail).join(' · ')}` : ''}`);
  }
  if (changes.length > max) console.log(`  … ${changes.length - max} more (frontdex history <id>)`);
}
