import type { Plugin } from 'vite';

export interface FrontdexViteOptions {
  /** Project root to scan (default: Vite's root). */
  root?: string;
  /** Inject the Alt+hover component overlay into the app's pages. */
  overlay?: boolean;
  /** Let other machines reach the API when the dev server is bound to the network (it serves source code). */
  allowLan?: boolean;
}

/** Keeps the catalogue updated while `vite` serves, and serves the frontdex UI at /__frontdex/. Dev only. */
export default function frontdex(options?: FrontdexViteOptions): Plugin;
