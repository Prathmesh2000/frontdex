import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { formatDetail } from './history.js';
import { knowledgeDir, scan } from './index.js';

const require = createRequire(import.meta.url);
const { createIndex } = require('./query.cjs');

const START = '<!-- frontdex:start -->';
const END = '<!-- frontdex:end -->';
// Blocks, servers, hooks and rule files written under the old react-catalogue name are replaced, not duplicated.
const BLOCK_RE = /\n*<!-- (?:react-catalogue|frontdex):start -->[\s\S]*?<!-- (?:react-catalogue|frontdex):end -->\n*/;
const CMD = 'npx frontdex';
const SERVER_NAME = 'frontdex';
const LEGACY_SERVER_NAME = 'react-catalogue';
const HOOK_RE = /(?:react-catalogue|frontdex) hook/;
export const TARGETS = ['agents-md', 'claude', 'cursor', 'opencode', 'copilot', 'hermes'];

/** Always-on agent rules, pointing at this project's knowledge folder and catalogue file. */
export const rulesFor = (config) => {
  const kb = path.relative(config.root, knowledgeDir(config)).split(path.sep).join('/');
  return `## Frontend knowledge base (frontdex)

This project keeps a generated map of every React component and page in \`${kb}/agent/\` (start at \`${kb}/agent/INDEX.md\`). Follow these rules for every frontend change:

1. **Before creating a component**, check for an existing one: MCP tool \`catalogue_find_existing\` with the name and props you plan (or \`${CMD} find <Name> --props a,b\`), and \`catalogue_search\` / \`${CMD} query "<terms or filters>"\` (filters: \`uses:Button\`, \`hook:useQuery\`, \`prop:onClose\`, \`is:shared\`). Reuse or extend instead of duplicating. Use design tokens (\`catalogue_tokens\`) instead of hard-coded colors and sizes.
2. **Before editing a component**, read its card: \`catalogue_component\`, \`${CMD} show <Name>\`, or \`${kb}/agent/components/<source folder>.md\`.
3. **Before changing props, exports or behaviour**, check the blast radius with \`catalogue_impact\` or \`${CMD} impact <Name>\`, and update every caller in the same change.
4. **Reuse what exists**: check \`catalogue_state\` (Redux/context/zustand), \`catalogue_api\` (endpoints) and \`catalogue_styles\` (CSS classes) before adding new state, API calls or styles.
5. **Do not ship regressions**: every effect that starts an interval, listener, subscription or observer must release it in its cleanup; avoid unused variables/props/imports. Check \`catalogue_health\` (or \`${CMD} health\`) for the components you touched.
6. **After editing components or routes**, run \`catalogue_rescan\` or \`${CMD} scan\`, and mention notable catalogue changes in your summary.
7. **Run the tests that cover what you changed**: \`catalogue_tests\` (or \`${CMD} tests <Name>\`) lists the unit and E2E tests mapped to a component or page, with the command to run them.
8. **Keep component docs current**: when you have read a component closely or changed it, save what it is for and how to use it with \`catalogue_enrich_write\` (\`catalogue_enrich_next\` lists components whose docs are missing or stale). Developers see these docs in the frontdex UI, and the next agent reads them.
9. Do not hand-edit \`${kb}/\` or \`${config.output}\`, except the human-owned fields (description, tags, owner, x-*).`;
};

function upsertBlock(file, body, { remove = false, create = true } = {}) {
  const exists = fs.existsSync(file);
  if (!exists && (remove || !create)) return null;
  const text = exists ? fs.readFileSync(file, 'utf8') : '';
  const block = `${START}\n${body}\n${END}`;
  const re = BLOCK_RE;
  let next;
  if (remove) next = text.replace(re, '\n').replace(/^\n+/, '');
  else if (re.test(text)) next = text.replace(re, `\n\n${block}\n`).replace(/^\n+/, '');
  else next = text ? `${text.replace(/\n*$/, '')}\n\n${block}\n` : `${block}\n`;
  if (next === text) return 'unchanged';
  if (remove && !next.trim()) {
    fs.rmSync(file);
    return 'removed';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return exists ? (remove ? 'removed' : 'updated') : 'created';
}

function updateJson(file, mutate, { remove = false } = {}) {
  const exists = fs.existsSync(file);
  if (!exists && remove) return null;
  let data = {};
  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return `skipped (not plain JSON; add the entry by hand)`;
    }
  }
  const before = JSON.stringify(data);
  mutate(data);
  if (JSON.stringify(data) === before) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return exists ? (remove ? 'removed' : 'updated') : 'created';
}

const stripOurHooks = (list) => (list ?? []).map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !HOOK_RE.test(String(h.command))) })).filter((g) => g.hooks.length);
const setServer = (servers, remove, entry) => {
  delete servers[LEGACY_SERVER_NAME];
  if (remove) delete servers[SERVER_NAME];
  else servers[SERVER_NAME] = entry;
};

/**
 * Wires coding agents to the knowledge base: always-on rules (AGENTS.md / CLAUDE.md / Cursor rules / Copilot),
 * MCP server registration, and hooks that push impact info back to the agent after every component edit.
 */
export function installAgents(config, { targets = TARGETS, remove = false, hooks = true, mcp = true } = {}) {
  const root = config.root;
  const at = (...p) => path.join(root, ...p);
  const results = [];
  const record = (file, status) => status && results.push({ file: path.relative(root, file) || file, status });
  const want = (t) => targets.includes(t);
  const mcpEntry = { type: 'stdio', command: 'npx', args: ['frontdex', 'mcp'] };
  const RULES = rulesFor(config);

  if (!remove) fs.mkdirSync(path.join(knowledgeDir(config), 'agent'), { recursive: true });
  const rulesFile = path.join(knowledgeDir(config), 'agent', 'RULES.md');
  if (remove) fs.rmSync(rulesFile, { force: true });
  else fs.writeFileSync(rulesFile, RULES + '\n');

  if (want('agents-md')) record(at('AGENTS.md'), upsertBlock(at('AGENTS.md'), RULES, { remove }));
  if (want('hermes')) {
    // Hermes reads only the first context file it finds; .hermes.md / HERMES.md shadow AGENTS.md.
    for (const f of ['.hermes.md', 'HERMES.md']) record(at(f), upsertBlock(at(f), RULES, { remove, create: false }));
  }
  if (want('claude')) {
    // Claude Code reads AGENTS.md only when there is no CLAUDE.md, so an existing CLAUDE.md gets an import.
    const rel = path.relative(root, rulesFile).split(path.sep).join('/');
    record(at('CLAUDE.md'), upsertBlock(at('CLAUDE.md'), `@${rel}`, { remove, create: false }));
    if (mcp) record(at('.mcp.json'), updateJson(at('.mcp.json'), (d) => setServer((d.mcpServers ??= {}), remove, mcpEntry), { remove }));
    if (hooks) {
      record(
        at('.claude', 'settings.json'),
        updateJson(
          at('.claude', 'settings.json'),
          (d) => {
            d.hooks ??= {};
            d.hooks.PostToolUse = stripOurHooks(d.hooks.PostToolUse);
            d.hooks.SessionStart = stripOurHooks(d.hooks.SessionStart);
            if (!remove) {
              d.hooks.PostToolUse.push({ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: `${CMD} hook post-edit --format claude`, timeout: 60 }] });
              d.hooks.SessionStart.push({ matcher: 'startup|resume|clear|compact', hooks: [{ type: 'command', command: `${CMD} hook session-start --format claude`, timeout: 60 }] });
            }
            for (const k of ['PostToolUse', 'SessionStart']) if (!d.hooks[k].length) delete d.hooks[k];
            if (!Object.keys(d.hooks).length) delete d.hooks;
          },
          { remove },
        ),
      );
    }
  }
  if (want('cursor')) {
    const legacyMdc = at('.cursor', 'rules', 'react-catalogue.mdc');
    if (fs.existsSync(legacyMdc)) fs.rmSync(legacyMdc), record(legacyMdc, 'removed');
    const mdc = at('.cursor', 'rules', 'frontdex.mdc');
    if (remove) {
      if (fs.existsSync(mdc)) fs.rmSync(mdc), record(mdc, 'removed');
    } else {
      const content = `---\ndescription: Frontend component knowledge base (frontdex)\nalwaysApply: true\n---\n\n${RULES}\n`;
      const existed = fs.existsSync(mdc);
      if (!existed || fs.readFileSync(mdc, 'utf8') !== content) {
        fs.mkdirSync(path.dirname(mdc), { recursive: true });
        fs.writeFileSync(mdc, content);
        record(mdc, existed ? 'updated' : 'created');
      } else record(mdc, 'unchanged');
    }
    if (mcp) record(at('.cursor', 'mcp.json'), updateJson(at('.cursor', 'mcp.json'), (d) => setServer((d.mcpServers ??= {}), remove, mcpEntry), { remove }));
    if (hooks) {
      record(
        at('.cursor', 'hooks.json'),
        updateJson(
          at('.cursor', 'hooks.json'),
          (d) => {
            d.version ??= 1;
            d.hooks ??= {};
            for (const k of ['postToolUse', 'sessionStart']) d.hooks[k] = (d.hooks[k] ?? []).filter((h) => !HOOK_RE.test(String(h.command)));
            if (!remove) {
              d.hooks.postToolUse.push({ command: `${CMD} hook post-edit --format cursor`, matcher: 'Write|Edit' });
              d.hooks.sessionStart.push({ command: `${CMD} hook session-start --format cursor` });
            }
            for (const k of ['postToolUse', 'sessionStart']) if (!d.hooks[k].length) delete d.hooks[k];
          },
          { remove },
        ),
      );
    }
  }
  if (want('opencode') && mcp) {
    const file = fs.existsSync(at('opencode.jsonc')) ? at('opencode.jsonc') : at('opencode.json');
    record(
      file,
      updateJson(
        file,
        (d) => {
          if (!remove) d.$schema ??= 'https://opencode.ai/config.json';
          setServer((d.mcp ??= {}), remove, { type: 'local', command: ['npx', 'frontdex', 'mcp'], enabled: true });
        },
        { remove },
      ),
    );
  }
  if (want('copilot')) record(at('.github', 'copilot-instructions.md'), upsertBlock(at('.github', 'copilot-instructions.md'), RULES, { remove }));

  const notes = [];
  if (want('hermes') && !remove) {
    notes.push(`Hermes reads AGENTS.md automatically. Its MCP servers are user-level only; add to ~/.hermes/config.yaml:\n  mcp_servers:\n    ${SERVER_NAME}:\n      command: "npx"\n      args: ["frontdex", "mcp"]`);
  }
  if (want('claude') && mcp && !remove) notes.push('Claude Code asks once to approve the project MCP server from .mcp.json.');
  return { results, notes };
}

// ---------- hook handlers ----------

async function readStdin() {
  if (process.stdin.isTTY) return {};
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

function editedPath(input, root) {
  const candidates = [input.tool_input?.file_path, input.tool_input?.path, input.file_path, input.path];
  try {
    const out = typeof input.tool_output === 'string' ? JSON.parse(input.tool_output) : input.tool_output;
    candidates.push(out?.filePath, out?.file_path, out?.path);
  } catch {}
  const hit = candidates.find((c) => typeof c === 'string' && c);
  return hit ? path.relative(root, path.resolve(root, hit)).split(path.sep).join('/') : null;
}

const emit = (format, event, text) => {
  if (!text) return;
  const payload = format === 'cursor' ? { additional_context: text } : { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  process.stdout.write(JSON.stringify(payload));
};

/** Hooks never fail the agent's tool call: any error is reported on stderr and the hook exits 0. */
export async function runHook(config, event, { format = 'claude' } = {}) {
  const input = await readStdin();
  try {
    const result = scan(config, { message: `agent edit` });
    if (event === 'session-start') {
      const index = path.join(knowledgeDir(config), 'agent', 'INDEX.md');
      const head = fs.existsSync(index) ? fs.readFileSync(index, 'utf8').slice(0, 6000) : '';
      return emit(format, 'SessionStart', `${rulesFor(config)}\n\n${head}`);
    }
    const files = new Set([...result.delta.changed, ...result.delta.added]);
    const edited = editedPath(input, config.root);
    if (edited) files.add(edited);
    const idx = createIndex(result.catalogue);
    const touched = idx.comps.filter((m) => files.has(m.c.file));
    const removed = (result.commit?.changes ?? []).filter((c) => c.change === 'removed');
    if (!touched.length && !removed.length) return;
    const lines = ['frontdex: component knowledge updated after your edit.'];
    for (const m of touched) {
      const impact = idx.impact(m.id);
      const change = result.commit?.changes.find((c) => c.key === m.id);
      lines.push(
        `- ${m.name} (\`${m.c.file}\`)${change ? ` ${change.change}${change.details ? `: ${change.details.map(formatDetail).join('; ')}` : ''}` : ''}. Rendered by: ${(m.c.usedBy ?? []).map((id) => idx.C[id]?.name ?? id).join(', ') || 'nothing'}. Pages: ${(m.c.pages ?? []).join(', ') || 'none'}.${impact.components.length ? ` If props/exports changed, verify ${impact.components.length} dependent component(s) (catalogue_impact ${m.name}).` : ''}`,
      );
    }
    for (const r of removed) lines.push(`- ${r.kind === 'pages' ? 'Page' : 'Component'} ${r.key} no longer exists; make sure nothing still imports it.`);
    emit(format, 'PostToolUse', lines.join('\n'));
  } catch (err) {
    process.stderr.write(`frontdex hook: ${err.message}\n`);
  }
}
