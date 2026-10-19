import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import YAML from 'yaml';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const schema = require('../spec/catalogue.schema.json');

const SCHEMA_HINT = '# yaml-language-server: $schema=./node_modules/frontdex/spec/catalogue.schema.json\n';

// Above this many components, `shard: "auto"` splits the YAML into a folder so a PR or a watch rescan touches a few small files.
export const SHARD_THRESHOLD = 500;
// Shards follow source folders, cut at this depth (src/features/billing/components): a change to one feature rewrites one
// shard, and a component only changes shard when its file moves. Deeper trees fold into their depth-4 ancestor.
const SHARD_DEPTH = 4;
const SHARD_HINT = '# frontdex catalogue, sharded: this index plus the component files listed under `shards`. Read it with readCatalogue().\n';
const yaml = (obj) => YAML.stringify(obj, { lineWidth: 0, aliasDuplicateObjects: false });

/** The sharded layout lives beside the single-file path: frontdex.yaml → frontdex/index.yaml + frontdex/components/*.yaml. */
export const shardDir = (file) => file.replace(/\.ya?ml$/, '');
const indexOf = (file) => path.join(shardDir(file), 'index.yaml');
export const shardOf = (componentFile) => `components/${path.posix.dirname(componentFile).split('/').filter((s) => s !== '.').slice(0, SHARD_DEPTH).join('__') || '_root'}.yaml`;

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};
const listShards = (dir) => (fs.existsSync(path.join(dir, 'components')) ? fs.readdirSync(path.join(dir, 'components')).filter((f) => f.endsWith('.yaml')) : []);

/** Reads either layout: the single file, or (when that is absent) the sharded folder beside it. */
export function readCatalogue(file) {
  const text = readText(file);
  if (text != null) return file.endsWith('.json') ? JSON.parse(text) : YAML.parse(text);
  const index = readText(indexOf(file));
  if (index == null) return null;
  return assembleShards(YAML.parse(index), (rel) => YAML.parse(fs.readFileSync(path.join(shardDir(file), rel), 'utf8')));
}

/** Rebuilds one document from a shard index; `readShard(relPath)` returns a parsed shard (ci.js passes one that reads a commit). */
export function assembleShards(index, readShard) {
  const { shards = [], catalogue, info, ...rest } = index;
  const components = shards.flatMap((s) => Object.entries(readShard(s)?.components ?? {}));
  components.sort(([a], [b]) => a.localeCompare(b));
  return { catalogue, info, components: Object.fromEntries(components), ...rest };
}

/** Whether `file` is written sharded under `shard`: true | false | "auto" (sticky once sharded, so the layout does not flip at the threshold). */
export function isSharded(file, catalogue, shard = false) {
  if (file.endsWith('.json')) return false;
  if (shard !== 'auto') return shard === true;
  return Object.keys(catalogue.components ?? {}).length > SHARD_THRESHOLD || fs.existsSync(indexOf(file));
}

/**
 * Writes the catalogue in the layout `shard` selects and removes the other one. Sharded writes skip files whose content
 * is unchanged; `memo` (a Map a watch session keeps) remembers what each file holds, so unchanged shards are not even
 * re-serialised. Returns the files written, relative to the shard folder ('' for the single file).
 */
export function writeCatalogue(file, catalogue, { shard = false, memo } = {}) {
  const dir = shardDir(file);
  if (!isSharded(file, catalogue, shard)) {
    fs.writeFileSync(file, file.endsWith('.json') ? JSON.stringify(catalogue, null, 2) + '\n' : SCHEMA_HINT + yaml(catalogue));
    if (dir !== file) removeShards(dir);
    memo?.clear();
    return [''];
  }
  const groups = new Map();
  for (const [id, c] of Object.entries(catalogue.components)) {
    const s = shardOf(c.file);
    if (!groups.has(s)) groups.set(s, {});
    groups.get(s)[id] = c;
  }
  const { components, ...rest } = catalogue;
  const shards = [...groups.keys()].sort();
  const written = [];
  const put = (rel, obj, hint) => {
    const json = JSON.stringify(obj);
    if (memo?.get(rel) === json) return;
    const target = path.join(dir, rel);
    const text = hint + yaml(obj);
    if (readText(target) !== text) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
      written.push(rel);
    }
    memo?.set(rel, json);
  };
  for (const s of shards) put(s, { components: groups.get(s) }, '');
  put('index.yaml', { ...rest, shards }, SHARD_HINT);
  const keep = new Set(shards);
  for (const f of listShards(dir)) {
    if (keep.has(`components/${f}`)) continue;
    fs.rmSync(path.join(dir, 'components', f));
    memo?.delete(`components/${f}`);
  }
  fs.rmSync(file, { force: true });
  return written;
}

/** Deletes a sharded layout, touching only the files its index lists, so a folder that merely shares the name survives. */
function removeShards(dir) {
  const text = readText(path.join(dir, 'index.yaml'));
  if (text == null) return;
  for (const s of YAML.parse(text)?.shards ?? []) fs.rmSync(path.join(dir, s), { force: true });
  fs.rmSync(path.join(dir, 'index.yaml'));
  for (const d of [path.join(dir, 'components'), dir]) {
    try {
      fs.rmdirSync(d);
    } catch {
      // Not empty: something else lives there.
    }
  }
}

/** mtime/size fingerprint of the catalogue in either layout, so a hand edit to any shard invalidates the JSON mirror. */
export function catalogueStat(file) {
  const single = fs.statSync(file, { throwIfNoEntry: false });
  if (single) return { mtimeMs: single.mtimeMs, size: single.size };
  const dir = shardDir(file);
  const index = fs.statSync(path.join(dir, 'index.yaml'), { throwIfNoEntry: false });
  if (!index) return null;
  let { mtimeMs, size } = index;
  for (const f of listShards(dir)) {
    const st = fs.statSync(path.join(dir, 'components', f));
    mtimeMs = Math.max(mtimeMs, st.mtimeMs);
    size += st.size;
  }
  return { mtimeMs, size };
}

let validator;
export function validateCatalogue(catalogue) {
  validator ??= new Ajv({ allErrors: true }).compile(schema);
  const ok = validator(catalogue);
  const errors = (validator.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
  const dangling = [];
  const ids = new Set(Object.keys(catalogue?.components ?? {}));
  for (const [id, c] of Object.entries(catalogue?.components ?? {})) {
    for (const ref of [...(c.renders ?? []), ...(c.usedBy ?? [])]) if (!ids.has(ref)) dangling.push(`/components/${id} references unknown component "${ref}"`);
  }
  for (const [route, p] of Object.entries(catalogue?.pages ?? {})) {
    for (const ref of [p.component, ...(p.layouts ?? []), ...(p.components ?? [])].filter(Boolean)) {
      if (!ids.has(ref)) dangling.push(`/pages/${route} references unknown component "${ref}"`);
    }
  }
  for (const [from, to] of Object.entries(catalogue?.aliases ?? {})) {
    if (!ids.has(to) && !catalogue.hooks?.[to]) dangling.push(`/aliases/${from} points to unknown id "${to}"`);
  }
  return { valid: ok && dangling.length === 0, errors: [...errors, ...dangling] };
}

const extensions = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => k.startsWith('x-')));

/** Carries human-owned fields from the previous document into a freshly generated one (see docs/SPEC.md, "Regeneration rules"). */
export function mergeManual(next, prev) {
  if (!prev) return next;
  if (prev.info?.description) next.info.description = prev.info.description;
  Object.assign(next, extensions(prev));
  Object.assign(next.info, extensions(prev.info));

  // A component whose ID changed (file moved) keeps its human-owned fields through the alias.
  const movedFrom = new Map(Object.entries(next.aliases ?? {}).filter(([from]) => prev.components?.[from]).map(([from, to]) => [to, from]));
  for (const [id, comp] of Object.entries(next.components)) {
    const old = prev.components?.[id] ?? prev.components?.[movedFrom.get(id)];
    if (!old) continue;
    if (old.description) comp.description = old.description;
    if (old.status && comp.status !== 'deprecated') comp.status = old.status;
    if (old.tags) comp.tags = old.tags;
    if (old.owner) comp.owner = old.owner;
    Object.assign(comp, extensions(old));
    for (const [name, prop] of Object.entries(comp.props ?? {})) {
      const oldProp = old.props?.[name];
      if (oldProp?.description) prop.description = oldProp.description;
      Object.assign(prop, extensions(oldProp));
    }
  }
  for (const [route, page] of Object.entries(next.pages)) {
    const old = prev.pages?.[route];
    if (!old) continue;
    if (old.description) page.description = old.description;
    if (old.tags) page.tags = old.tags;
    Object.assign(page, extensions(old));
  }
  return next;
}
