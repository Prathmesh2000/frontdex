import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeAgentKnowledge } from './agent-kb.js';
import { listEnrichment } from './enrichment.js';
import { createHistory } from './history.js';
import { sameSourcesIn, SOURCE_EXT } from './scanner/files.js';
import { patchProject, scanProject } from './scanner/graph.js';
import { catalogueStat, isSharded, mergeManual, readCatalogue, shardDir, writeCatalogue } from './spec.js';

export { loadConfig, initConfig } from './config.js';
export { scanProject } from './scanner/graph.js';
export { readCatalogue, writeCatalogue, validateCatalogue, mergeManual, isSharded, shardDir } from './spec.js';
export { createHistory } from './history.js';
export { createTools } from './tools.js';
export { enrichmentState, enrichmentSummary, listEnrichment, nextToEnrich, readEnrichment, writeEnrichment } from './enrichment.js';

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
  const stat = catalogueStat(file);
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
 * `full` ignores the cache; `dryRun` writes nothing (used by `frontdex check`).
 *
 * `session` is a plain object a long-running caller (watch, serve, MCP) passes on every call. It keeps the parse cache,
 * file list and catalogue in memory, so a rescan skips re-reading them from disk; with `changed` (absolute paths from
 * the file watcher) it also skips the directory walk and the stat of every other file. Cache files on disk are then
 * written by flushSession() instead of on every scan.
 */
export function scan(config, { full = false, dryRun = false, message, session, changed: changedPaths, fast = false } = {}) {
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
  // `fast` (watch sessions): patch the changed files' components into the in-memory catalogue in milliseconds. Nothing
  // is written and no history is recorded; the full scan the watcher runs once edits settle does that, and corrects the
  // project-wide parts the patch carried over. Falls back to a full scan when a patch cannot be exact enough.
  const patchable = fast && warm && !full && session.linker && session.catalogue && changedPaths?.length && patchablePaths(config, session.files, changedPaths);
  if (patchable) {
    const patch = patchProject(session.linker, session.catalogue, patchable);
    if (patch) {
      lap('patch');
      session.catalogue = patch.catalogue;
      session.catalogueHash = undefined;
      session.pending ||= patch.changed;
      const delta = { added: [], changed: [], removed: [], reused: 0, parsed: patch.parsed, relinked: patch.relinked };
      return { catalogue: patch.catalogue, changed: patch.changed, fast: true, file, commit: null, agent: null, warnings: [], delta, timings };
    }
  }
  const prev = session?.catalogue ?? readPrevious(file, mirrorFile);
  const cache = full ? null : warm ? session.cache : readJson(cacheFile);
  const known = warm && !full && changedPaths ? { files: session.files, changed: changedPaths, resolver: session.resolver, lister: session.lister } : undefined;
  lap('read');
  const result = scanProject(config, { cache, known, previous: prev });
  Object.assign(timings, result.timings);
  mark = performance.now();
  const { catalogue, delta } = result;
  mergeManual(catalogue, prev);
  // A session keeps the last catalogue's hash, so a rescan serialises once (the JSON is tens of MB at 20k files, and
  // holding it between scans cost that much memory for a comparison).
  const hash = stableHash(catalogue);
  // Only valid while `prev` is the session's own copy; after a hand edit the watcher drops it and prev comes from disk.
  const prevHash = session?.catalogue && session.catalogueHash;
  // After fast patches the session's catalogue already shows the edit, but nothing has been written or committed yet.
  const changed = !prev || !!session?.pending || (prevHash || stableHash(prev)) !== hash;
  if (session) session.pending = false;
  if (!changed) catalogue.info.generatedAt = prev.info.generatedAt;
  lap('compare');
  const out = { ...result, file, changed, commit: null, agent: null, timings };
  delete out.cache;
  delete out.cacheDirty;
  delete out.files;
  delete out.resolver;
  delete out.lister;
  delete out.linker;
  if (dryRun) return out;

  ensureKnowledgeDir(kb);
  // The `shard` setting (or the component count under "auto") asks for the other layout: rewrite even if nothing changed.
  const relayout = isSharded(file, catalogue, config.shard) === fs.existsSync(file);
  if (session) {
    // YAML serialisation is the slowest step of a warm rescan, so it waits for flushSession() with the cache.
    session.dirty = (warm && session.dirty) || result.cacheDirty || changed || relayout;
    session.yamlDirty = (warm && session.yamlDirty) || changed || relayout;
    Object.assign(session, { cache: result.cache, files: result.files, resolver: result.resolver, lister: result.lister, linker: result.linker, catalogue, catalogueHash: hash });
    if (!warm) flushSession(config, session);
  } else {
    if (changed || relayout) writeCatalogue(file, catalogue, { shard: config.shard });
    if (result.cacheDirty) writeCache(cacheFile, result.cache);
    if (changed || relayout || !fs.existsSync(mirrorFile)) writeMirror(mirrorFile, file, catalogue);
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
 * The watcher-reported paths a fast patch can handle: known source files. Folder events that changed no source file,
 * temp files that came and went, and stylesheets (only project-wide passes read them; the settling scan does) are
 * dropped. Null when source files were added or removed: ids, pages and imports may change, so only a full scan will do.
 */
function patchablePaths(config, files, changed) {
  const known = new Set(files.sources);
  const out = [];
  for (const abs of changed) {
    if (known.has(abs)) {
      out.push(abs);
      continue;
    }
    const stat = fs.statSync(abs, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      if (!sameSourcesIn(config, files, abs)) return null;
    } else if (!stat) {
      // Gone: a deleted folder if it held known files, otherwise an editor's temp file.
      if (files.sources.some((f) => f.startsWith(abs + path.sep))) return null;
    } else if (SOURCE_EXT.includes(path.extname(abs))) return null;
  }
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
  // The memo lets a sharded catalogue rewrite only the shards this burst of edits touched.
  if (wroteYaml) session.written = writeCatalogue(file, session.catalogue, { shard: config.shard, memo: (session.shardMemo ??= new Map()) });
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
  // Docs written through MCP change the cards without changing the catalogue, so they are part of the stamp too.
  const docs = listEnrichment(config);
  const format = docs.size ? `${AGENT_FORMAT}:${createHash('sha1').update([...docs].map(([id, r]) => `${id}@${r.writtenAt}`).sort().join('\n')).digest('hex').slice(0, 12)}` : AGENT_FORMAT;
  if (!changed && readText(stamp) === format && fs.existsSync(path.join(agentDir, 'INDEX.md'))) return null;
  const written = writeAgentKnowledge(agentDir, catalogue, memo, { kb: path.relative(config.root, kb).split(path.sep).join('/'), docs });
  fs.mkdirSync(path.dirname(stamp), { recursive: true });
  fs.writeFileSync(stamp, format);
  return written;
}

function writeCache(cacheFile, cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
}

function writeMirror(mirrorFile, file, catalogue) {
  const stat = catalogueStat(file);
  if (stat) fs.writeFileSync(mirrorFile, JSON.stringify({ mtimeMs: stat.mtimeMs, size: stat.size, catalogue }));
}

/**
 * The catalogue half of `frontdex upgrade`. A full rescan against the 1.x document keeps every ID it holds (they become
 * the stable baseline), records aliases for IDs that did change (files moved since the last scan) and applies the
 * `shard` layout. History is keyed by the same IDs, so it stays readable as is. Returns null when there is no catalogue.
 */
export function upgradeCatalogue(config) {
  const file = path.resolve(config.root, config.output);
  const before = readCatalogue(file);
  if (!before) return null;
  const { catalogue, commit } = scan(config, { full: true, message: 'frontdex upgrade' });
  const aliases = Object.fromEntries(Object.entries(catalogue.aliases ?? {}).filter(([from]) => before.aliases?.[from] === undefined));
  return { aliases, sharded: !fs.existsSync(file), shardDir: shardDir(file), commit };
}

/** @deprecated use scan(); kept for the 0.1 API. */
export const generate = (config) => scan(config);

function stableHash(cat) {
  return createHash('sha1').update(JSON.stringify({ ...cat, info: { ...cat.info, generatedAt: undefined } })).digest('hex');
}
