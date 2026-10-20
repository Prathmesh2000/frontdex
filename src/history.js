import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/*
 * Git-like history of the catalogue:
 *   history/packs/<commit>.json.gz   content-addressed objects first seen in that commit (components, pages, manifest)
 *   history/index.json               object hash → pack
 *   history/log.jsonl                one commit per line: parent, time, manifest hash, git HEAD, change list
 * Unchanged components are shared across commits, so a commit costs one small pack holding only what changed.
 */

const MAX_LISTED_CHANGES = 500;
// Derived or positional fields: they shift when *other* code changes, so they don't count as a change to this item.
const IGNORED_COMPONENT_FIELDS = new Set(['usedBy', 'pages', 'line']);
const IGNORED_PAGE_FIELDS = new Set(['components']);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function createHistory(dir) {
  const packsDir = path.join(dir, 'packs');
  const logFile = path.join(dir, 'log.jsonl');
  const indexFile = path.join(dir, 'index.json');
  let index = null;
  const pending = new Map();
  const loadedPacks = new Map();

  const getIndex = () => (index ??= fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {});
  const put = (obj) => {
    const text = stable(obj);
    const hash = createHash('sha1').update(text).digest('hex');
    if (!getIndex()[hash] && !pending.has(hash)) pending.set(hash, text);
    return hash;
  };
  const get = (hash) => {
    if (pending.has(hash)) return JSON.parse(pending.get(hash));
    const pack = getIndex()[hash];
    if (!pack) throw new Error(`history object ${hash} is missing`);
    if (!loadedPacks.has(pack)) loadedPacks.set(pack, JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(packsDir, pack + '.json.gz'))).toString('utf8')));
    return JSON.parse(loadedPacks.get(pack)[hash]);
  };
  const flush = (packId) => {
    if (!pending.size) return;
    fs.mkdirSync(packsDir, { recursive: true });
    fs.writeFileSync(path.join(packsDir, packId + '.json.gz'), zlib.gzipSync(JSON.stringify(Object.fromEntries(pending))));
    for (const hash of pending.keys()) getIndex()[hash] = packId;
    fs.writeFileSync(indexFile, JSON.stringify(index));
    pending.clear();
  };

  const log = () =>
    fs.existsSync(logFile)
      ? fs
          .readFileSync(logFile, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [];

  function snapshot(catalogue) {
    const { generatedAt, ...info } = catalogue.info;
    return {
      info,
      components: Object.fromEntries(Object.entries(catalogue.components).map(([id, c]) => [id, put(c)])),
      pages: Object.fromEntries(Object.entries(catalogue.pages).map(([r, p]) => [r, put(p)])),
      // Only present once an ID has changed, so manifests (and their hashes) of catalogues without aliases are as before.
      ...(catalogue.aliases && { aliases: catalogue.aliases }),
    };
  }

  function diffManifests(before, after) {
    const changes = [];
    const summary = {};
    for (const kind of ['components', 'pages']) {
      const ignored = kind === 'components' ? IGNORED_COMPONENT_FIELDS : IGNORED_PAGE_FIELDS;
      const d = diffKind(kind, before?.[kind] ?? {}, after[kind], kind === 'components' && after.aliases, ignored, get);
      changes.push(...d.changes);
      summary[kind] = d.summary;
    }
    return { summary, changes };
  }

  /** Records a commit if the catalogue differs from the last one. Returns the commit, or null when nothing changed. */
  function commit(catalogue, { root, message, limit = 500 } = {}) {
    const entries = log();
    const parent = entries.at(-1);
    const manifest = snapshot(catalogue);
    const manifestHash = put(manifest);
    if (parent?.manifest === manifestHash) return (pending.clear(), null);
    const { summary, changes } = diffManifests(parent ? get(parent.manifest) : null, manifest);
    const meaningful = changes.length > 0;
    if (parent && !meaningful) return (pending.clear(), null);
    const time = new Date().toISOString();
    const entry = {
      id: createHash('sha1').update(`${parent?.id}:${manifestHash}:${time}`).digest('hex').slice(0, 10),
      parent: parent?.id ?? null,
      time,
      manifest: manifestHash,
      git: gitHead(root),
      message: message ?? (parent ? undefined : 'initial scan'),
      summary,
      changes: changes.slice(0, MAX_LISTED_CHANGES),
      truncated: changes.length > MAX_LISTED_CHANGES || undefined,
    };
    fs.mkdirSync(dir, { recursive: true });
    flush(entry.id);
    const kept = [...entries, entry].slice(-limit);
    if (kept.length <= entries.length) fs.writeFileSync(logFile, kept.map((e) => JSON.stringify(e)).join('\n') + '\n');
    else fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    return entry;
  }

  /** Rebuilds the full catalogue as it was at a commit. */
  function checkout(id) {
    const entry = log().find((e) => e.id === id || e.id.startsWith(id));
    if (!entry) return null;
    const m = get(entry.manifest);
    return {
      entry,
      catalogue: {
        catalogue: '1.1',
        info: { ...m.info, generatedAt: entry.time },
        components: Object.fromEntries(Object.entries(m.components).map(([k, h]) => [k, get(h)])),
        pages: Object.fromEntries(Object.entries(m.pages).map(([k, h]) => [k, get(h)])),
        ...(m.aliases && { aliases: m.aliases }),
      },
    };
  }

  return { log, commit, checkout };
}

/** Drops `line` everywhere: inserting code above a component shifts every line number without changing behaviour. */
function withoutLines(v) {
  if (Array.isArray(v)) return v.map(withoutLines);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'line').map(([k, x]) => [k, withoutLines(x)]));
  // Labels such as "useEffect L26" or issue messages embed line numbers too.
  if (typeof v === 'string') return v.replace(/\bL\d+\b/g, 'L#');
  return v;
}

const itemKey = (x) => {
  if (!x || typeof x !== 'object') return String(x);
  if (x.name) return x.name;
  if (x.via && x.phases) return `${x.via}${x.deps ? `[${x.deps.join(', ')}]` : ''}`;
  return [x.type, x.via, x.call, x.event, x.method, x.target, x.action, x.path, x.field, x.schema, x.fn].filter(Boolean).join(' ') || stable(x);
};

function keyed(v) {
  if (Array.isArray(v)) {
    const out = new Map();
    v.forEach((x) => {
      let k = itemKey(x);
      while (out.has(k)) k += "'";
      out.set(k, x);
    });
    return out;
  }
  return new Map(Object.entries(v ?? {}));
}

/** Field-level description of what changed between two versions of a component or page. */
function describe(a, b, ignored) {
  a = withoutLines(a);
  b = withoutLines(b);
  const out = [];
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignored.has(field) || stable(a[field]) === stable(b[field])) continue;
    const va = a[field];
    const vb = b[field];
    if ((va && typeof va === 'object') || (vb && typeof vb === 'object')) {
      const ma = keyed(va);
      const mb = keyed(vb);
      const added = [...mb.keys()].filter((k) => !ma.has(k));
      const removed = [...ma.keys()].filter((k) => !mb.has(k));
      const modified = [...mb.keys()].filter((k) => ma.has(k) && stable(ma.get(k)) !== stable(mb.get(k)));
      if (added.length + removed.length + modified.length === 0) modified.push('order');
      out.push({ field, ...(added.length && { added }), ...(removed.length && { removed }), ...(modified.length && { modified }) });
    } else {
      out.push({ field, from: va, to: vb });
    }
  }
  return out;
}

/**
 * Field-level diff of two whole catalogues (e.g. two git refs), same rules as history commits: added / removed /
 * changed components, pages and endpoints, ignoring line shifts and derived fields (usedBy, pages, components).
 */
export function diffCatalogues(before, after, { ignoreComponentFields = [] } = {}) {
  const changes = [];
  const summary = {};
  const componentIgnored = new Set([...IGNORED_COMPONENT_FIELDS, ...ignoreComponentFields]);
  for (const kind of ['components', 'pages', 'endpoints']) {
    const ignored = kind === 'components' ? componentIgnored : kind === 'pages' ? IGNORED_PAGE_FIELDS : new Set();
    const d = diffKind(kind, before?.[kind] ?? {}, after?.[kind] ?? {}, kind === 'components' && after?.aliases, ignored);
    changes.push(...d.changes);
    if (kind !== 'endpoints' || d.changes.length) summary[kind] = d.summary;
  }
  return { summary, changes };
}

/**
 * Added / changed / removed keys of one kind. A new key that `aliases` maps from a vanished key is the same item under a
 * new ID (its file moved), reported once as `renamed` with `from`, not as a remove plus an add. `load` turns stored
 * values into records (history stores hashes); identical values are skipped without describing them.
 */
function diffKind(kind, a, b, aliases, ignored, load = (x) => x) {
  const summary = { added: 0, removed: 0, changed: 0 };
  const changes = [];
  const renamedFrom = new Map(Object.entries(aliases || {}).filter(([from, to]) => from in a && !(from in b) && to in b && !(to in a)).map(([from, to]) => [to, from]));
  for (const key of Object.keys(b)) {
    const from = key in a ? key : renamedFrom.get(key);
    if (from === undefined) {
      summary.added++;
      changes.push({ kind, key, change: 'added' });
      continue;
    }
    const details = a[from] === b[key] ? [] : describe(load(a[from]), load(b[key]), ignored);
    if (from !== key) {
      summary.renamed = (summary.renamed ?? 0) + 1;
      changes.push({ kind, key, change: 'renamed', from, ...(details.length && { details }) });
    } else if (details.length) {
      summary.changed++;
      changes.push({ kind, key, change: 'changed', details });
    }
  }
  const renamed = new Set(renamedFrom.values());
  for (const key of Object.keys(a)) {
    if (key in b || renamed.has(key)) continue;
    summary.removed++;
    changes.push({ kind, key, change: 'removed' });
  }
  return { summary, changes };
}

function gitHead(root) {
  if (!root) return undefined;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/** One-line human summary of a commit, e.g. "+2 ~1 →1 −0 components · +1 pages" (→ counts components whose ID moved). */
export function formatSummary(summary) {
  return Object.entries(summary)
    .map(([kind, s]) => [kind, [s.added && `+${s.added}`, s.changed && `~${s.changed}`, s.renamed && `→${s.renamed}`, s.removed && `−${s.removed}`].filter(Boolean).join(' ')])
    .filter(([, t]) => t)
    .map(([kind, t]) => `${t} ${kind}`)
    .join(' · ') || 'no changes';
}

export function formatDetail(d) {
  if ('from' in d || 'to' in d) return `${d.field}: ${JSON.stringify(d.from) ?? '∅'} → ${JSON.stringify(d.to) ?? '∅'}`;
  return [d.field, d.added && `+${d.added.join(' +')}`, d.removed && `−${d.removed.join(' −')}`, d.modified && `~${d.modified.join(' ~')}`].filter(Boolean).join(' ');
}
