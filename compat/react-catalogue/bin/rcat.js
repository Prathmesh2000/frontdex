#!/usr/bin/env node
// The old command names run the frontdex CLI after a one-line notice (stderr, so --json output stays clean).
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

console.error('react-catalogue is now frontdex: install `frontdex` and run `frontdex` (this command still works).');
const pkg = createRequire(import.meta.url).resolve('frontdex/package.json');
await import(pathToFileURL(path.join(path.dirname(pkg), 'bin', 'frontdex.js')).href);
