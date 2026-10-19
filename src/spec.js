import fs from 'node:fs';
import { createRequire } from 'node:module';
import YAML from 'yaml';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const schema = require('../spec/catalogue.schema.json');

const SCHEMA_HINT = '# yaml-language-server: $schema=./node_modules/frontdex/spec/catalogue.schema.json\n';

export function readCatalogue(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(text) : YAML.parse(text);
}

export function writeCatalogue(file, catalogue) {
  const body = file.endsWith('.json')
    ? JSON.stringify(catalogue, null, 2) + '\n'
    : SCHEMA_HINT + YAML.stringify(catalogue, { lineWidth: 0, aliasDuplicateObjects: false });
  fs.writeFileSync(file, body);
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
  return { valid: ok && dangling.length === 0, errors: [...errors, ...dangling] };
}

const extensions = (obj) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => k.startsWith('x-')));

/** Carries human-owned fields from the previous document into a freshly generated one (see docs/SPEC.md, "Regeneration rules"). */
export function mergeManual(next, prev) {
  if (!prev) return next;
  if (prev.info?.description) next.info.description = prev.info.description;
  Object.assign(next, extensions(prev));
  Object.assign(next.info, extensions(prev.info));

  for (const [id, comp] of Object.entries(next.components)) {
    const old = prev.components?.[id];
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
