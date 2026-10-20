// Compiled by test/types.test.js (tsc --noEmit --strict): uses the published declarations the way a consumer would.
import { loadConfig, readCatalogue, scan, validateCatalogue, type Catalogue, type Component } from '../src/index.js';
import frontdex from '../src/plugins/vite.js';

const config = loadConfig('.');
const result = scan(config, { dryRun: true });
const cat: Catalogue = result.catalogue;
const first: Component | undefined = Object.values(cat.components)[0];
const file: string | undefined = first?.file;
const valid: boolean = validateCatalogue(readCatalogue(config.output)).valid;
const plugin = frontdex({ overlay: true });
export { file, plugin, valid };
