import { workerData } from 'node:worker_threads';
import { CHUNK, loadOne } from './parse-pool.js';

// Worker side of loadMany(): results go out in small chunks as they are made, so the worker's heap never holds its whole
// slice (holding it is what made workers on big projects run out of memory and die). Every post bumps the shared
// counter the main thread waits on.
const { jobs, port, signal } = workerData;
const post = (message) => {
  port.postMessage(message);
  Atomics.add(signal, 0, 1);
  Atomics.notify(signal, 0);
};
try {
  for (let from = 0; from < jobs.length; from += CHUNK) post({ from, results: jobs.slice(from, from + CHUNK).map(([file, prevHash]) => loadOne(file, prevHash)) });
} catch {
  // Whatever was not delivered is loaded on the main thread, which then reports the error itself.
} finally {
  post({ end: true });
}
