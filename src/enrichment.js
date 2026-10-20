// Component docs written by coding agents through the MCP server: purpose, props and how to pass them, functions,
// usage examples, notes. frontdex never writes them itself (it makes no model calls); it decides which components
// most need them, validates and stores what the agent sends, and shows it in the UI and agent cards.
//
// One JSON file per component in .frontdex/enrichment/, committed with the project so the next developer and the next
// agent run reuse it. Each file carries a signature of the component it describes; when the component's props, state,
// functions, hooks or children change, the docs are reported stale so an agent refreshes them.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const schema = require('../spec/enrichment.schema.json');
let validator;

export const enrichmentDir = (config) => path.resolve(config.root, config.knowledgeDir, 'enrichment');

// Readable and collision-free: the name for humans browsing the folder, a hash of the full id for Name@file clashes.
const fileFor = (id) => `${id.split('@')[0].replace(/[^\w.-]/g, '_')}--${createHash('sha1').update(id).digest('hex').slice(0, 8)}.json`;

/** What the docs describe: when this changes, the docs may be wrong. */
export function signature(component) {
  const keys = (o) => Object.keys(o ?? {}).sort();
  const names = (list) => (list ?? []).map((x) => (typeof x === 'string' ? x : x.name)).sort();
  const shape = { file: component.file, props: component.props ?? {}, state: keys(component.state), functions: names(component.functions), hooks: names(component.hooks), renders: [...(component.renders ?? [])].sort() };
  return createHash('sha1').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}

/** Every stored doc, by component id; `files` maps each id to the file holding it. */
function scanDir(config) {
  const dir = enrichmentDir(config);
  const records = new Map();
  const files = new Map();
  if (!fs.existsSync(dir)) return { records, files };
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (record?.id && record.doc) records.set(record.id, record), files.set(record.id, path.join(dir, f));
    } catch {
      // A hand-broken file is skipped rather than failing the scan; the agent can rewrite it.
    }
  }
  return { records, files };
}

export const listEnrichment = (config) => scanDir(config).records;

export const readEnrichment = (config, id) => listEnrichment(config).get(id) ?? null;

/** fresh: written against the current component; stale: the component changed since. */
export function enrichmentState(record, component) {
  if (!record) return 'none';
  return component && record.sourceHash === signature(component) ? 'fresh' : 'stale';
}

/**
 * Validates and stores an agent's docs for one component. Throws with the schema errors when `doc` is malformed,
 * and names props/functions the component does not have (a sign the agent documented the wrong thing).
 */
export function writeEnrichment(config, catalogue, id, doc, { by } = {}) {
  const component = catalogue.components[id];
  if (!component) throw new Error(`No component "${id}"`);
  validator ??= new Ajv({ allErrors: true }).compile(schema);
  if (!validator(doc)) throw new Error(`Invalid docs: ${validator.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  const unknownProps = Object.keys(doc.props ?? {}).filter((p) => !component.props?.[p]);
  const warnings = unknownProps.length ? [`props not found on ${component.name}: ${unknownProps.join(', ')}`] : [];
  const record = { id, name: component.name, file: component.file, sourceHash: signature(component), writtenAt: new Date().toISOString(), ...(by && { by }), doc };
  const dir = enrichmentDir(config);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, fileFor(id));
  // An earlier file for this id under another name (renamed scheme, hand-copied file) would shadow the new one.
  const previous = scanDir(config).files.get(id);
  if (previous && previous !== target) fs.rmSync(previous, { force: true });
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
  return { record, warnings };
}

/** Counts for the UI and agents: how much of the catalogue is documented, and how much of that is out of date. */
export function enrichmentSummary(config, catalogue) {
  const all = listEnrichment(config);
  let fresh = 0;
  let stale = 0;
  for (const [id, record] of all) (enrichmentState(record, catalogue.components[id]) === 'fresh' ? fresh++ : stale++);
  return { components: Object.keys(catalogue.components).length, documented: all.size, fresh, stale };
}

/**
 * Which components most need docs: undocumented or stale first, then the ones developers meet most (rendered in many
 * places, on many pages, with props to get right). Stale docs outrank missing ones on equal footing: wrong docs mislead.
 */
export function nextToEnrich(config, catalogue, limit = 10) {
  const all = listEnrichment(config);
  return Object.entries(catalogue.components)
    .map(([id, c]) => ({ id, c, state: enrichmentState(all.get(id), c) }))
    .filter((x) => x.state !== 'fresh')
    .map((x) => ({ ...x, score: (x.state === 'stale' ? 5 : 0) + 3 * (x.c.usedBy?.length ?? 0) + 2 * (x.c.pages?.length ?? 0) + Object.keys(x.c.props ?? {}).length + (x.c.description ? 0 : 1) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
