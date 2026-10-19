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
 */
export function scan(config, { full = false, dryRun = false, message } = {}) {
  const kb = knowledgeDir(config);
  const cacheFile = path.join(kb, 'cache', 'files.json');
  const mirrorFile = path.join(kb, 'cache', 'catalogue.json');
  const file = path.resolve(config.root, config.output);
  const prev = readPrevious(file, mirrorFile);
  const cache = full ? null : readJson(cacheFile);
  const result = scanProject(config, { cache });
  const { catalogue, delta } = result;
  mergeManual(catalogue, prev);
  const changed = !prev || stableJson(prev) !== stableJson(catalogue);
  if (!changed) catalogue.info.generatedAt = prev.info.generatedAt;
  const out = { ...result, file, changed, commit: null, agent: null };
  delete out.cache;
  if (dryRun) return out;

  ensureKnowledgeDir(kb);
  if (!cache || delta.parsed || delta.removed.length) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result.cache));
  }
  if (changed) writeCatalogue(file, catalogue);
  if (changed || !fs.existsSync(mirrorFile)) {
    const { mtimeMs, size } = fs.statSync(file);
    fs.writeFileSync(mirrorFile, JSON.stringify({ mtimeMs, size, catalogue }));
  }
  const agentDir = path.join(kb, 'agent');
  // Not gated on `changed`: a new card format with an unchanged catalogue must still reach the agents. Only differing files are rewritten.
  if (config.agents.enabled) out.agent = writeAgentKnowledge(agentDir, catalogue);
  if (config.history.enabled) {
    const history = createHistory(path.join(kb, 'history'));
    if (changed || !history.log().length) out.commit = history.commit(catalogue, { root: config.root, message, limit: config.history.limit });
  }
  return out;
}

/** @deprecated use scan(); kept for the 0.1 API. */
export const generate = (config) => scan(config);

function stableJson(cat) {
  return JSON.stringify({ ...cat, info: { ...cat.info, generatedAt: undefined } });
}
