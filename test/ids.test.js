import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHistory, flushSession, isSharded, knowledgeDir, loadConfig, readCatalogue, scan, scanProject, upgradeCatalogue, validateCatalogue, writeCatalogue } from '../src/index.js';

const BIN = path.resolve(import.meta.dirname, '../bin/frontdex.js');
const UI_BUTTON = 'src/components/ui/Button.tsx';
const OTHER = 'src/features/other/Button.tsx';
const MISC = 'src/features/misc/Button.tsx';
const SECOND_BUTTON = 'export function Button({ label }: { label: string }) { return <i>{label}</i>; }\n';

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fdx-ids-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../examples/next-app'), dir, { recursive: true, filter: (src) => !/[\\/]\.frontdex([\\/]|$)|frontdex\.yaml$/.test(src) });
  return dir;
}
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
const move = (dir, from, to) => {
  fs.mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
  fs.renameSync(path.join(dir, from), path.join(dir, to));
};
const strip = (c) => ({ ...c, info: { ...c.info, generatedAt: undefined } });

test('stable IDs: a same-named component added elsewhere does not rename the existing one', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  scan(config);
  write(dir, OTHER, SECOND_BUTTON);
  const r = scan(config);
  assert.equal(r.catalogue.components.Button.file, UI_BUTTON);
  assert.equal(r.catalogue.components[`Button@${OTHER}`].file, OTHER);
  assert.ok(r.catalogue.components.Header.renders.includes('Button'), 'references keep the old ID');
  assert.deepEqual(r.commit.summary.components, { added: 1, removed: 0, changed: 0 });
  assert.equal(r.catalogue.aliases, undefined);
  // A cold scan (no previous catalogue) still qualifies every holder of a shared name, as 1.x did.
  assert.ok(scanProject(config).catalogue.components[`Button@${UI_BUTTON}`]);
});

test('aliases: a moved component keeps resolving, its human fields follow, history shows a rename', () => {
  const dir = tempProject();
  const config = loadConfig(dir);
  write(dir, OTHER, SECOND_BUTTON);
  scan(config);
  const file = path.join(dir, config.output);
  const doc = readCatalogue(file);
  doc.components[`Button@${OTHER}`].description = 'the other button';
  writeCatalogue(file, doc);

  move(dir, OTHER, MISC);
  move(dir, 'src/components/ui/Spinner.tsx', 'src/components/feedback/Spinner.tsx');
  const r = scan(config, { message: 'move' });
  assert.deepEqual(r.catalogue.aliases, { [`Button@${OTHER}`]: `Button@${MISC}` });
  assert.equal(r.catalogue.components[`Button@${MISC}`].description, 'the other button');
  assert.equal(r.catalogue.components.Spinner.file, 'src/components/feedback/Spinner.tsx', 'a bare ID survives a move unchanged');
  assert.ok(validateCatalogue(r.catalogue).valid, validateCatalogue(r.catalogue).errors.join('\n'));

  const renamed = r.commit.changes.find((c) => c.change === 'renamed');
  assert.equal(renamed.key, `Button@${MISC}`);
  assert.equal(renamed.from, `Button@${OTHER}`);
  assert.ok(!r.commit.changes.some((c) => c.change === 'removed' || c.change === 'added'));
  assert.equal(r.commit.summary.components.renamed, 1);
  assert.deepEqual(readCatalogue(file).aliases, r.catalogue.aliases);

  // Moving back makes the old ID live again: the alias is dropped rather than shadowing it.
  move(dir, MISC, OTHER);
  assert.equal(scan(config).catalogue.aliases?.[`Button@${OTHER}`], undefined);
});

test('sharded layout: write/read round-trip equals the single file, and switching back cleans up', () => {
  const dir = tempProject();
  const single = scan(loadConfig(dir)).catalogue;
  const output = path.join(dir, 'frontdex.yaml');

  const sharded = loadConfig(dir, { shard: true });
  scan(sharded);
  assert.equal(fs.existsSync(output), false);
  assert.ok(fs.existsSync(path.join(dir, 'frontdex/index.yaml')));
  assert.ok(fs.readdirSync(path.join(dir, 'frontdex/components')).includes('src__features__products.yaml'));
  const read = readCatalogue(output);
  assert.equal(JSON.stringify(strip(read)), JSON.stringify(strip(single)), 'same content and key order');
  assert.equal(scan(sharded).changed, false, 'a rescan of the sharded layout is a no-op');

  scan(loadConfig(dir, { shard: false }));
  assert.ok(fs.existsSync(output));
  assert.equal(fs.existsSync(path.join(dir, 'frontdex')), false);
  assert.deepEqual(strip(readCatalogue(output)), strip(single));

  const many = { components: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`C${i}`, {}])) };
  assert.equal(isSharded(output, many, 'auto'), true);
  assert.equal(isSharded(output, single, 'auto'), false);
});

test('sharded watch session rewrites only the shards an edit touched', () => {
  const dir = tempProject();
  const config = loadConfig(dir, { shard: true });
  const session = {};
  scan(config, { session });
  const shards = path.join(dir, 'frontdex/components');
  const total = fs.readdirSync(shards).length;
  assert.ok(total > 3 && session.written.length === total + 1, 'the first flush writes every shard and the index');

  const file = path.join(dir, 'src/features/products/ProductGrid.tsx');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('pageSize?: number;', 'pageSize?: number;\n  title?: string;'));
  scan(config, { session, changed: [file] });
  assert.equal(flushSession(config, session), true);
  // The index carries info.generatedAt, so it is rewritten with any change; no other shard is.
  assert.deepEqual(session.written, ['components/src__features__products.yaml', 'index.yaml']);
  assert.deepEqual(strip(readCatalogue(path.join(dir, config.output))), strip(session.catalogue));
});

test('upgrade migrates a 1.x catalogue: IDs kept, aliases for moved files, sharded on request, history readable', () => {
  const dir = tempProject();
  write(dir, OTHER, SECOND_BUTTON);
  // A 1.x document: a cold scan qualifies both Buttons, exactly as the 1.x rule did.
  const first = scan(loadConfig(dir));
  assert.ok(first.catalogue.components[`Button@${UI_BUTTON}`] && first.catalogue.components[`Button@${OTHER}`]);
  assert.equal(first.catalogue.catalogue, '1.1');

  move(dir, OTHER, MISC);
  const cfgFile = path.join(dir, 'frontdex.config.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')), shard: true }));
  const out = execFileSync(process.execPath, [BIN, 'upgrade', '-C', dir], { encoding: 'utf8' });
  assert.match(out, /stable IDs, 1 alias\(es\) for changed IDs · sharded into/);

  const config = loadConfig(dir);
  const after = readCatalogue(path.join(dir, config.output));
  assert.ok(after.components[`Button@${UI_BUTTON}`], 'existing IDs are the stable baseline');
  assert.deepEqual(after.aliases, { [`Button@${OTHER}`]: `Button@${MISC}` });
  assert.equal(fs.existsSync(path.join(dir, 'frontdex.yaml')), false);

  const history = createHistory(path.join(knowledgeDir(config), 'history'));
  const log = history.log();
  assert.equal(log.at(-1).message, 'frontdex upgrade');
  assert.ok(log.at(-1).changes.some((c) => c.change === 'renamed' && c.from === `Button@${OTHER}`));
  assert.ok(history.checkout(first.commit.id).catalogue.components[`Button@${OTHER}`], 'old commits still check out');
  assert.equal(upgradeCatalogue(config).commit, null, 'a second upgrade changes nothing');
});
