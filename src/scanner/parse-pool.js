import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';
import { parseAstro } from './adapters/astro.js';
import { parseHtml } from './adapters/html.js';
import { parseSvelte } from './adapters/svelte.js';
import { parseVue } from './adapters/vue.js';
import { parseFile } from './parse-file.js';

// Non-JS file types and their adapters; everything else is parsed by Babel in parseFile().
const ADAPTERS = { '.vue': parseVue, '.svelte': parseSvelte, '.astro': parseAstro, '.html': parseHtml };

// Parsed modules hold Maps; the cache (JSON) and worker messages carry them as entry arrays.
export const MAP_FIELDS = ['imports', 'exports', 'aliases'];

/** Parses one file into its cacheable (Map-free) form. */
export function parseOne(file, code) {
  const adapter = ADAPTERS[path.extname(file)] ?? parseFile;
  const mod = adapter(file, code);
  delete mod.file;
  return { ...mod, ...Object.fromEntries(MAP_FIELDS.map((k) => [k, [...mod[k]]])) };
}

/** Reads and hashes a file; parses it only when the hash differs from `prevHash` (a touch or checkout keeps its parse). */
export function loadOne(file, prevHash) {
  const code = fs.readFileSync(file, 'utf8');
  const hash = createHash('sha1').update(code).digest('hex');
  return hash === prevHash ? { hash } : { hash, mod: parseOne(file, code) };
}

// Each worker loads Babel (~100 ms) and starts with cold JIT, so small batches parse faster on the main thread.
const MIN_FILES = 400;
const FILES_PER_WORKER = 200;
// Measured on a 4-core/8-thread laptop: 2-3 workers beat 7 (hyper-threads and thermal limits make more workers slower).
// Node exposes no physical core count, so half the logical CPUs minus one stands in for it.
const MAX_THREADS = Math.max(2, Math.floor(os.availableParallelism() / 2) - 1);
// Without limits each worker's heap grew to ~200 MB before collecting (1.6 GB RSS for 7k files); with them ~500 MB.
// ponytail: a worker that exceeds the old-generation limit dies and we only notice at the deadline below; per-worker
// progress counters would detect it sooner if that ever happens in practice.
const WORKER_LIMITS = { maxYoungGenerationSizeMb: 16, maxOldGenerationSizeMb: 256 };

/**
 * Runs loadOne() over [file, prevHash] jobs, returning results in job order. Large batches (cold scans) are split across
 * a few worker threads, which then read and hash in parallel too.
 * Stays synchronous so scan() keeps its sync API: the main thread blocks on a shared counter and pulls each worker's
 * result with receiveMessageOnPort. Anything a worker fails to deliver is parsed on the main thread instead.
 */
export function loadMany(jobs) {
  const threads = Math.min(MAX_THREADS, Math.floor(jobs.length / FILES_PER_WORKER));
  if (jobs.length < MIN_FILES || threads < 2) return jobs.map(([file, prevHash]) => loadOne(file, prevHash));

  const done = new Int32Array(new SharedArrayBuffer(4));
  const size = Math.ceil(jobs.length / threads);
  const slices = Array.from({ length: threads }, (_, i) => jobs.slice(i * size, (i + 1) * size)).filter((s) => s.length);
  const workers = slices.map((slice) => {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(new URL('./parse-worker.js', import.meta.url), { workerData: { jobs: slice, port: port2, done }, transferList: [port2], resourceLimits: WORKER_LIMITS });
    worker.unref();
    return { worker, port: port1, slice };
  });

  // A worker that dies without reaching its `finally` never bumps the counter; the deadline stops us waiting forever.
  const deadline = Date.now() + 60_000 + jobs.length * 20;
  for (let seen; (seen = Atomics.load(done, 0)) < workers.length && Date.now() < deadline; ) Atomics.wait(done, 0, seen, 1000);

  return workers.flatMap(({ worker, port, slice }) => {
    const message = receiveMessageOnPort(port)?.message;
    port.close();
    worker.terminate();
    return Array.isArray(message) ? message : slice.map(([file, prevHash]) => loadOne(file, prevHash));
  });
}
