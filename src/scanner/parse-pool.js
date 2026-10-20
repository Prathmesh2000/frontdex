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
const WORKER_LIMITS = { maxYoungGenerationSizeMb: 16, maxOldGenerationSizeMb: 256 };
// Files per message from a worker: small enough that a worker's heap stays flat, large enough that messaging is noise.
export const CHUNK = 25;
// No message from any worker for this long means one died (a crash, or a file too big for its heap limit): the main
// thread loads what is missing. A chunk of 25 files takes well under a second, so this only fires on a real failure.
const STALL_MS = 20_000;

/**
 * Runs loadOne() over [file, prevHash] jobs, returning results in job order. Large batches (cold scans) are split across
 * a few worker threads, which then read and hash in parallel too.
 * Stays synchronous so scan() keeps its sync API: the main thread blocks on a shared counter and drains each worker's
 * chunks with receiveMessageOnPort as they arrive. Anything a worker fails to deliver is loaded on the main thread.
 */
export function loadMany(jobs) {
  const threads = Math.min(MAX_THREADS, Math.floor(jobs.length / FILES_PER_WORKER));
  if (jobs.length < MIN_FILES || threads < 2) return jobs.map(([file, prevHash]) => loadOne(file, prevHash));

  const signal = new Int32Array(new SharedArrayBuffer(4));
  const size = Math.ceil(jobs.length / threads);
  const workers = [];
  for (let offset = 0; offset < jobs.length; offset += size) {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(new URL('./parse-worker.js', import.meta.url), { workerData: { jobs: jobs.slice(offset, offset + size), port: port2, signal }, transferList: [port2], resourceLimits: WORKER_LIMITS });
    worker.unref();
    workers.push({ worker, port: port1, offset, ended: false });
  }

  const results = new Array(jobs.length);
  let lastMessage = Date.now();
  while (workers.some((w) => !w.ended) && Date.now() - lastMessage < STALL_MS) {
    // Read the counter before draining: a chunk posted after the drain changes it, so the wait below returns at once.
    const seen = Atomics.load(signal, 0);
    for (const w of workers) {
      for (let m; !w.ended && (m = receiveMessageOnPort(w.port)); lastMessage = Date.now()) {
        if (m.message.end) w.ended = true;
        else m.message.results.forEach((r, i) => (results[w.offset + m.message.from + i] = r));
      }
    }
    if (workers.some((w) => !w.ended)) Atomics.wait(signal, 0, seen, 1000);
  }
  for (const { worker, port } of workers) {
    port.close();
    worker.terminate();
  }
  for (let i = 0; i < jobs.length; i++) results[i] ??= loadOne(...jobs[i]);
  return results;
}
