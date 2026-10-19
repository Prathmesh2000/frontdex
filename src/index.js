import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeAgentKnowledge } from './agent-kb.js';
import { createHistory } from './history.js';
import { scanProject } from './scanner/graph.js';
import { mergeManual, readCatalogue, writeCatalogue } from './spec.js';

export { loadConfig, initConfig } from './config.js';
export { scanProject } from './scanner/graph.js';
export { readCatalogue, writeCatalogue, validateCatalogue, mergeManual } from './spec.js';
export { createHistory } from './history.js';
export { createTools } from './tools.js';

export const knowledgeDir = (config) => path.resolve(config.root, config.knowledgeDir);

// Fingerprint of the agent card generator, so a format change refreshes cards even when the catalogue is unchanged.
const AGENT_FORMAT = createHash('sha1').update(fs.readFileSync(new URL('./agent-kb.js', import.meta.url))).digest('hex').slice(0, 12);

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Parsing a large YAML file dominates rescans, so reuse the JSON mirror while the YAML is untouched since we wrote it. */
function readPrevious(file, mirrorFile) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  const mirror = readJson(mirrorFile);
  if (mirror && mirror.mtimeMs === stat.mtimeMs && mirror.size === stat.size) return mirror.catalogue;
  try {
    return readCatalogue(file);
  } catch {
    return null;
  }
}

function ensureKnowledgeDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  // The cache is machine-local; history is local by default (delete the line to share it through git).
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, 'cache/\nhistory/\n');
}

/**
 * Incremental scan: re-parses only files whose content changed since the last scan, then rewrites the human catalogue,
 * the agent knowledge base and a history commit only if the result differs.
 * `full` ignores the cache; `dryRun` writes nothing (used by `rcat check`).
 *
 * `session` is a plain object a long-running caller (watch, serve, MCP) passes on every call. It keeps the parse cache,
 * file list and catalogue in memory, so a rescan skips re-reading them from disk; with `changed` (absolute paths from
 * the file watcher) it also skips the directory walk and the stat of every other file. Cache files on disk are then
 * written by flushSession() instead of on every scan.
 */
export function scan(config, { full = false, dryRun = false, message, session, changed: changedPaths } = {}) {
  const kb = knowledgeDir(config);
  const cacheFile = path.join(kb, 'cache', 'files.json');
  const mirrorFile = path.join(kb, 'cache', 'catalogue.json');
  const file = path.resolve(config.root, config.output);
  let mark = performance.now();
  const lap = (stage) => {
    const now = performance.now();
    timings[stage] = Math.round(now - mark);
    mark = now;
  };
  const timings = {};
  const warm = !!session?.cache;
  const prev = session?.catalogue ?? readPrevious(file, mirrorFile);
  const cache = full ? null : warm ? session.cache : readJson(cacheFile);
  const known = warm && !full && changedPaths ? { files: session.files, changed: changedPaths, resolver: session.resolver } : undefined;
  lap('read');
  const result = scanProject(config, { cache, known });
  Object.assign(timings, result.timings);
  mark = performance.now();
  const { catalogue, delta } = result;
  mergeManual(catalogue, prev);
  const changed = !prev || stableJson(prev) !== stableJson(catalogue);
  if (!changed) catalogue.info.generatedAt = prev.info.generatedAt;
  lap('compare');
  const out = { ...result, file, changed, commit: null, agent: null, timings };
  delete out.cache;
  delete out.cacheDirty;
  delete out.files;
  delete out.resolver;
  if (dryRun) return out;

  ensureKnowledgeDir(kb);
  if (session) {
    // YAML serialisation is the slowest step of a warm rescan, so it waits for flushSession() with the cache.
    session.dirty = (warm && session.dirty) || result.cacheDirty || changed;
    session.yamlDirty = (warm && session.yamlDirty) || changed;
    Object.assign(session, { cache: result.cache, files: result.files, resolver: result.resolver, catalogue });
    if (!warm) flushSession(config, session);
  } else {
    if (changed) writeCatalogue(file, catalogue);
    if (result.cacheDirty) writeCache(cacheFile, result.cache);
    if (changed || !fs.existsSync(mirrorFile)) writeMirror(mirrorFile, file, catalogue);
  }
  lap('write');
  // A warm session leaves the agent cards to flushSession() as well; a burst of saves then regenerates them once.
  if (warm) session.agentDirty ||= changed;
  else out.agent = refreshAgentKnowledge(config, catalogue, changed, session && (session.agentFiles ??= new Map()));
  lap('agent');
  if (config.history.enabled) {
    const history = createHistory(path.join(kb, 'history'));
    if (changed || !history.log().length) out.commit = history.commit(catalogue, { root: config.root, message, limit: config.history.limit });
  }
  lap('history');
  return out;
}

/**
 * Writes what a session deferred: the catalogue YAML (if it changed), the parse cache and the catalogue mirror.
 * Returns true when the YAML was written, so a watcher can tell its own write from a hand edit.
 */
export function flushSession(config, session) {
  if (!session?.dirty || !session.cache) return false;
  const kb = knowledgeDir(config);
  const file = path.resolve(config.root, config.output);
  const wroteYaml = !!session.yamlDirty;
  if (wroteYaml) writeCatalogue(file, session.catalogue);
  writeCache(path.join(kb, 'cache', 'files.json'), session.cache);
  writeMirror(path.join(kb, 'cache', 'catalogue.json'), file, session.catalogue);
  if (session.agentDirty) refreshAgentKnowledge(config, session.catalogue, true, session.agentFiles);
  session.dirty = session.yamlDirty = session.agentDirty = false;
  return wroteYaml;
}

/** Rewrites agent cards when the catalogue changed or the card format did (a new agent-kb.js must reach agents even when the catalogue did not change). */
function refreshAgentKnowledge(config, catalogue, changed, memo) {
  if (!config.agents.enabled) return null;
  const kb = knowledgeDir(config);
  const agentDir = path.join(kb, 'agent');
  const stamp = path.join(kb, 'cache', 'agent-format');
  if (!changed && readText(stamp) === AGENT_FORMAT && fs.existsSync(path.join(agentDir, 'INDEX.md'))) return null;
  const written = writeAgentKnowledge(agentDir, catalogue, memo);
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, AGENT_FORMAT);
  return written;
}

function writeCache(cacheFile, cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
}

function writeMirror(mirrorFile, file, catalogue) {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat) fs.writeFileSync(mirrorFile, JSON.stringify({ mtimeMs: stat.mtimeMs, size: stat.size, catalogue }));
}

/** @deprecated use scan(); kept for the 0.1 API. */
export const generate = (config) => scan(config);

function stableJson(cat) {
  return JSON.stringify({ ...cat, info: { ...cat.info, generatedAt: undefined } });
}
