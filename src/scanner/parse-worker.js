import { workerData } from 'node:worker_threads';
import { loadOne } from './parse-pool.js';

// Worker side of loadMany(): load a slice, post the results, then bump the shared counter the main thread waits on.
const { jobs, port, done } = workerData;
try {
  port.postMessage(jobs.map(([file, prevHash]) => loadOne(file, prevHash)));
} catch (err) {
  port.postMessage({ error: err.message });
} finally {
  Atomics.add(done, 0, 1);
  Atomics.notify(done, 0);
}
