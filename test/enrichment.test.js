import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { enrichmentState, enrichmentSummary, listEnrichment, nextToEnrich, readEnrichment, signature, writeEnrichment } from '../src/enrichment.js';

const config = () => ({ root: fs.mkdtempSync(path.join(os.tmpdir(), 'enrich-')), knowledgeDir: '.frontdex' });
const catalogue = () => ({
  components: {
    Button: { name: 'Button', file: 'src/Button.tsx', props: { label: { type: 'string', required: true }, onClick: { type: '() => void', required: false } }, usedBy: ['Form', 'Header', 'Card'], pages: ['/'] },
    Form: { name: 'Form', file: 'src/Form.tsx', props: {}, renders: ['Button'] },
    Card: { name: 'Card', file: 'src/Card.tsx', props: { title: { type: 'string', required: true } }, renders: ['Button'], pages: ['/', '/x'] },
  },
});

test('agent docs are validated, stored per component, and go stale when the component changes', () => {
  const cfg = config();
  const cat = catalogue();
  const doc = { purpose: 'Primary action button.', props: { label: { description: 'Button text.', howToPass: 'A short verb, e.g. "Save".' }, nope: { description: 'x' } }, usage: [{ title: 'Basic', code: '<Button label="Save" />' }] };
  const { warnings } = writeEnrichment(cfg, cat, 'Button', doc, { by: 'claude' });
  assert.deepEqual(warnings, ['props not found on Button: nope']);
  const record = readEnrichment(cfg, 'Button');
  assert.equal(record.doc.purpose, 'Primary action button.');
  assert.equal(record.by, 'claude');
  assert.equal(enrichmentState(record, cat.components.Button), 'fresh');
  // A new prop changes what the docs describe.
  cat.components.Button.props.size = { type: "'sm' | 'lg'", required: false };
  assert.equal(enrichmentState(record, cat.components.Button), 'stale');
  assert.deepEqual(enrichmentSummary(cfg, cat), { components: 3, documented: 1, fresh: 0, stale: 1 });
  // Rewriting replaces the file, it does not add a second one.
  writeEnrichment(cfg, cat, 'Button', { purpose: 'Button v2.' });
  assert.equal(listEnrichment(cfg).size, 1);
  assert.equal(fs.readdirSync(path.join(cfg.root, '.frontdex/enrichment')).length, 1);
});

test('malformed docs are refused with the schema errors', () => {
  const cfg = config();
  assert.throws(() => writeEnrichment(cfg, catalogue(), 'Button', { summary: 'no purpose' }), /Invalid docs: .*purpose/);
  assert.throws(() => writeEnrichment(cfg, catalogue(), 'Missing', { purpose: 'x' }), /No component "Missing"/);
  assert.throws(() => writeEnrichment(cfg, catalogue(), 'Button', { purpose: 'x', extra: 1 }), /additional properties/);
});

test('next to document: undocumented and stale components, most used first', () => {
  const cfg = config();
  const cat = catalogue();
  assert.deepEqual(nextToEnrich(cfg, cat).map((x) => x.id), ['Button', 'Card', 'Form']);
  writeEnrichment(cfg, cat, 'Button', { purpose: 'x' });
  assert.deepEqual(nextToEnrich(cfg, cat).map((x) => x.id), ['Card', 'Form'], 'fresh docs drop out');
  assert.notEqual(signature(cat.components.Card), signature(cat.components.Form));
});
