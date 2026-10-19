import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, readCatalogue, scan } from '../src/index.js';

/*
 * Golden files: the committed catalogue.yaml and .catalogue/agent/ of each example are the expected output.
 * Any scanner change that alters them fails here; if the change is intended, regenerate with
 * `node bin/rcat.js scan -C examples/<name>` and review the diff like any other code change.
 */

const EXAMPLES = path.resolve(import.meta.dirname, '../examples');

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

for (const name of fs.readdirSync(EXAMPLES)) {
  test(`golden output: ${name}`, () => {
    const src = path.join(EXAMPLES, name);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `golden-${name}-`));
    // Copy sources only, so the scan starts cold and cannot reuse the committed output.
    fs.cpSync(src, dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}.catalogue`) && !p.endsWith('catalogue.yaml') });
    const config = loadConfig(dir);
    const { catalogue } = scan(config);

    const expected = readCatalogue(path.join(src, config.output));
    const strip = (c) => ({ ...c, info: { ...c.info, generatedAt: undefined } });
    assert.deepEqual(strip(catalogue), strip(expected));

    const agentDir = (root) => path.join(root, config.knowledgeDir, 'agent');
    const files = listFiles(agentDir(src));
    assert.deepEqual(listFiles(agentDir(dir)).sort(), [...files].sort());
    const norm = (s) => s.replace(/\r\n/g, '\n');
    for (const f of files) assert.equal(norm(fs.readFileSync(path.join(agentDir(dir), f), 'utf8')), norm(fs.readFileSync(path.join(agentDir(src), f), 'utf8')), f);
  });
}
