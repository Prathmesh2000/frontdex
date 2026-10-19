import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CONFIG_FILE, LEGACY } from './config.js';
import { knowledgeDir, scan } from './index.js';
import { listProjectFiles } from './scanner/files.js';

/*
 * `frontdex doctor`: what frontdex detected about the project and why, and what is missing. The first thing to run when
 * a page, route or component does not show up.
 */

// File types that need the project's own compiler, and the package that provides it.
const COMPILERS = { '.vue': 'vue/compiler-sfc', '.svelte': 'svelte/compiler', '.astro': '@astrojs/compiler/sync' };

export function diagnose(config) {
  const checks = [];
  const add = (status, area, message, hint) => checks.push({ status, area, message, ...(hint && { hint }) });
  const rel = (f) => path.relative(config.root, f).split(path.sep).join('/') || '.';

  const configFile = [CONFIG_FILE, LEGACY.configFile].map((f) => path.join(config.root, f)).find((f) => fs.existsSync(f));
  add(configFile ? 'ok' : 'info', 'config', configFile ? `using ${rel(configFile)}` : 'no config file; defaults apply (zero-config)', configFile ? undefined : 'npx frontdex init');
  if (config.legacy) add('warn', 'config', 'react-catalogue file names in use', 'npx frontdex upgrade');

  add('ok', 'project', `framework ${config.framework}${config.packageManager ? ` · package manager ${config.packageManager}` : ' · no lockfile or packageManager field found'}`);
  if (config.workspaces.length) add('ok', 'workspaces', config.workspaces.map((w) => `${w.name} (${rel(w.dir)}, ${w.framework})`).join(', '));
  if (config.html) add('info', 'html', '.html files are scanned as pages (no JS framework found in dependencies)');

  const files = listProjectFiles(config);
  const byExt = {};
  for (const f of files.sources) byExt[path.extname(f)] = (byExt[path.extname(f)] ?? 0) + 1;
  add(files.sources.length ? 'ok' : 'error', 'files', `${files.sources.length} source file(s) (${Object.entries(byExt).map(([e, n]) => `${n} ${e}`).join(', ') || 'none'}), ${files.styles.length} stylesheet(s) under ${config.include.join(', ')}`, files.sources.length ? undefined : 'check "include" / "exclude" in the config');

  for (const [ext, compiler] of Object.entries(COMPILERS)) {
    if (!byExt[ext]) continue;
    let found = false;
    try {
      createRequire(path.join(config.root, 'package.json')).resolve(compiler);
      found = true;
    } catch {}
    add(found ? 'ok' : 'error', 'compilers', `${ext} files ${found ? 'parse with' : 'need'} ${compiler}`, found ? undefined : `install ${compiler.split('/')[0].replace(/^@astrojs$/, 'astro')} in the project`);
  }

  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = path.join(config.root, name);
    if (fs.existsSync(file)) add('ok', 'aliases', `${name} found (paths and extends are followed; nested configs apply per folder)`);
  }

  const result = scan(config, { dryRun: true });
  const { catalogue } = result;
  add(catalogue.info.routers?.length ? 'ok' : 'warn', 'routing', catalogue.info.routers?.length ? `${Object.keys(catalogue.pages).length} page(s) via ${catalogue.info.routers.join(', ')}` : 'no routes found', catalogue.info.routers?.length ? undefined : 'pages come from file-system routers (app/, pages/, src/routes …) or route objects/JSX; check the router package is a dependency');
  const unresolved = Object.entries(catalogue.pages).filter(([, p]) => !p.component).map(([r]) => r);
  if (unresolved.length) add('warn', 'routing', `page component not resolved for ${unresolved.slice(0, 5).join(', ')}${unresolved.length > 5 ? ' …' : ''}`, 'the route file needs a default export (or a component for TanStack)');
  add('ok', 'components', `${Object.keys(catalogue.components).length} component(s), ${Object.keys(catalogue.hooks ?? {}).length} custom hook(s), ${Object.keys(catalogue.stores ?? {}).length} store(s), ${Object.keys(catalogue.endpoints ?? {}).length} endpoint(s)`);
  for (const w of result.warnings.slice(0, 10)) add('warn', 'parse', w);
  if (result.changed) add('info', 'catalogue', `${config.output} is missing or out of date`, 'npx frontdex scan');

  const kb = knowledgeDir(config);
  const agentsMd = path.join(config.root, 'AGENTS.md');
  const wired = fs.existsSync(agentsMd) && /<!-- (frontdex|react-catalogue):start -->/.test(fs.readFileSync(agentsMd, 'utf8'));
  add(wired ? 'ok' : 'info', 'agents', wired ? 'agent rules installed (AGENTS.md)' : 'coding agents are not wired', wired ? undefined : 'npx frontdex agents');
  let mcp = false;
  try {
    createRequire(path.join(config.root, 'package.json')).resolve('frontdex-mcp');
    mcp = true;
  } catch {}
  add(mcp ? 'ok' : 'info', 'agents', mcp ? 'frontdex-mcp installed' : 'MCP server not installed', mcp ? undefined : 'npm install --save-dev frontdex-mcp');
  if (!fs.existsSync(kb)) add('info', 'knowledge', `${rel(kb)}/ not created yet`, 'npx frontdex scan');

  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: config.root, stdio: 'ignore' });
    add('ok', 'git', 'git checkout: diff, pr-comment and owners can use history');
  } catch {
    add('info', 'git', 'not a git checkout: diff and git activity are unavailable');
  }
  return checks;
}

export function formatDiagnosis(checks) {
  const mark = { ok: '✔', info: '•', warn: '⚠', error: '✖' };
  return checks.map((c) => `${mark[c.status]} ${c.area.padEnd(11)} ${c.message}${c.hint ? `\n  ${' '.repeat(11)} → ${c.hint}` : ''}`).join('\n');
}
