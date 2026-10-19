import os from 'node:os';
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';
import { parseFile } from './parse-file.js';

// Parsed modules hold Maps; the cache (JSON) and worker messages carry them as entry arrays.
export const MAP_FIELDS = ['imports', 'exports', 'aliases'];

/** Parses one file into its cacheable (Map-free) form. */
export function parseOne(file, code) {
  const mod = parseFile(file, code);
  delete mod.file;
  return { ...mod, ...Object.fromEntries(MAP_FIELDS.map((k) => [k, [...mod[k]]])) };
}

// Each worker loads Babel (~100 ms), so small batches parse faster on the main thread.
const MIN_FILES = 400;
const FILES_PER_WORKER = 200;

/**
 * Parses [file, code] jobs, returning results in job order. Large batches are split across worker threads.
 * Stays synchronous so scan() keeps its sync API: the main thread blocks on a shared counter and pulls each worker's
 * result with receiveMessageOnPort. Anything a worker fails to deliver is parsed on the main thread instead.
 */
export function parseMany(jobs) {
  const threads = Math.min(os.availableParallelism() - 1, Math.floor(jobs.length / FILES_PER_WORKER));
  if (jobs.length < MIN_FILES || threads < 2) return jobs.map(([file, code]) => parseOne(file, code));

  const done = new Int32Array(new SharedArrayBuffer(4));
  const size = Math.ceil(jobs.length / threads);
  const slices = Array.from({ length: threads }, (_, i) => jobs.slice(i * size, (i + 1) * size)).filter((s) => s.length);
  const workers = slices.map((slice) => {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(new URL('./parse-worker.js', import.meta.url), { workerData: { jobs: slice, port: port2, done }, transferList: [port2] });
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
    return Array.isArray(message) ? message : slice.map(([file, code]) => parseOne(file, code));
  });
}
