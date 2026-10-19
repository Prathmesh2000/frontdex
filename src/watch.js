import fs from 'node:fs';
import path from 'node:path';
import { formatSummary } from './history.js';
import { flushSession, scan } from './index.js';
import { globToRegExp, SOURCE_EXT, STYLE_EXT } from './scanner/files.js';
import { shardDir } from './spec.js';

const DEBOUNCE_MS = 250;
// catalogue.yaml and the parse cache are written once edits pause, not after every save (YAML output is the slow part).
const FLUSH_MS = 1000;

/**
 * Keeps the knowledge base in sync with the source tree. Every burst of file events triggers one incremental scan.
 * `onUpdate(result)` fires after a scan that changed the catalogue; `onSpecEdit()` fires when someone hand-edits catalogue.yaml.
 */
export function startWatcher(config, { onUpdate, onSpecEdit, onError, log = () => {} } = {}) {
  const output = path.resolve(config.root, config.output);
  const shards = shardDir(output);
  const kbDir = path.resolve(config.root, config.knowledgeDir);
  const excludes = config.exclude.map(globToRegExp);
  let timer;
  let running = false;
  let again = false;
  let lastWrite = 0;
  let flushTimer;
  const changedFiles = new Set();
  // Keeps the parse cache, file list and catalogue in memory between scans (see scan()).
  const session = {};
  const flush = () => {
    try {
      if (flushSession(config, session)) lastWrite = Date.now();
    } catch (err) {
      log(`✖ ${err.message}`);
    }
  };

  const run = () => {
    if (running) return void (again = true);
    running = true;
    const files = [...changedFiles];
    changedFiles.clear();
    try {
      const result = scan(config, {
        session,
        changed: files.map((f) => path.resolve(config.root, f)),
        message: files.length ? `auto: ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` +${files.length - 3}` : ''}` : undefined,
      });
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, FLUSH_MS);
      flushTimer.unref?.();
      result.warnings.forEach((w) => log(`⚠ ${w}`));
      if (result.changed) {
        lastWrite = Date.now();
        log(`↻ ${result.delta.parsed} file(s) re-parsed → ${result.commit ? formatSummary(result.commit.summary) : 'catalogue updated'}`);
        onUpdate?.(result);
      }
    } catch (err) {
      (onError ?? ((e) => log(`✖ ${e.message}`)))(err);
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };

  const onEvent = (filename) => {
    if (!filename) return;
    const abs = path.resolve(config.root, filename);
    if (abs === output || abs.startsWith(shards + path.sep)) {
      if (Date.now() - lastWrite > 1000) {
        // A hand edit to the catalogue: drop the in-memory copy so the next scan merges the edited fields.
        session.catalogue = null;
        onSpecEdit?.();
      }
      return;
    }
    if (abs.startsWith(kbDir + path.sep)) return;
    const rel = path.relative(config.root, abs).split(path.sep).join('/');
    // Extensionless paths may be folders being created, renamed or deleted; scan() works out which.
    const ext = path.extname(rel);
    if ((ext && !SOURCE_EXT.includes(ext) && !STYLE_EXT.includes(ext) && !(config.html && ext === '.html')) || excludes.some((re) => re.test(rel) || re.test(rel + '/'))) return;
    changedFiles.add(rel);
    schedule();
  };

  const watchers = [];
  try {
    watchers.push(fs.watch(config.root, { recursive: true }, (_e, f) => onEvent(f)));
  } catch {
    // Recursive fs.watch is missing on Linux before Node 20; fall back to one watcher per directory.
    const walk = (dir) => {
      const rel = path.relative(config.root, dir).split(path.sep).join('/');
      if (rel && excludes.some((re) => re.test(rel) || re.test(rel + '/'))) return;
      watchers.push(fs.watch(dir, (_e, f) => f && onEvent(path.join(rel, f))));
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) walk(path.join(dir, d.name));
    };
    walk(config.root);
  }

  return {
    rescan: run,
    close() {
      clearTimeout(timer);
      clearTimeout(flushTimer);
      flush();
      watchers.forEach((w) => w.close());
    },
  };
}
