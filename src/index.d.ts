// Public API of `frontdex`. Hand-written; test/types.test.js checks that it declares exactly what src/index.js exports.
// The catalogue document types are generated from the JSON Schema (spec/catalogue.d.ts) and re-exported here.
import type { Catalogue, Component } from '../spec/catalogue.js';

export type * from '../spec/catalogue.js';

/** frontdex.config.json merged over the defaults, plus what loadConfig() detects from the project. */
export interface Config {
  root: string;
  title: string;
  version?: string;
  include: string[];
  exclude: string[];
  /** The catalogue file; a sharded catalogue lives in the folder of the same name (frontdex.yaml → frontdex/). */
  output: string;
  /** Split the YAML into per-folder files: true, false, or "auto" (above 500 components). */
  shard?: boolean | 'auto';
  port: number;
  /** Where the running app is served, for the page Preview tab. */
  preview: string;
  /** File whose default export wraps component previews in the app's providers (Vite + React). */
  previewWrapper?: string;
  autoUpdate: boolean;
  knowledgeDir: string;
  history: { enabled: boolean; limit: number };
  agents: { enabled: boolean };
  framework: string;
  rootFramework: string;
  packageManager: string;
  html: boolean;
  deps: Record<string, string>;
  workspaces: { name: string; dir: string; framework?: string; pkg: Record<string, unknown> }[];
  /** True for projects still on react-catalogue file names (see `frontdex upgrade`). */
  legacy: boolean;
  [key: string]: unknown;
}

export interface Delta {
  added: string[];
  changed: string[];
  removed: string[];
  reused: number;
  parsed: number;
  /** Components re-linked by a fast (watch-session) patch. */
  relinked?: number;
}

export interface HistoryCommit {
  id: string;
  parent: string | null;
  time: string;
  git?: string;
  message?: string;
  summary: Record<string, { added: number; removed: number; changed: number }>;
  changes: { kind: string; key: string; change: 'added' | 'removed' | 'changed' | 'renamed'; details?: unknown[] }[];
}

export interface ScanResult {
  catalogue: Catalogue;
  /** Whether the catalogue differs from the previous one (and was written, unless dryRun or a session deferred it). */
  changed: boolean;
  /** True when a watch session patched the edit in without a full scan; the next full scan settles project-wide fields. */
  fast?: boolean;
  file: string;
  commit: HistoryCommit | null;
  warnings: string[];
  delta: Delta;
  stats?: { files: number; components: number; pages: number };
  timings: Record<string, number>;
}

/**
 * State a long-running caller (watcher, server, MCP) keeps between scans: parse cache, file list, catalogue and the
 * linking state the fast path needs. Treat it as opaque; create it as `{}` and pass the same object every time.
 */
export type Session = Record<string, unknown>;

export interface ScanOptions {
  /** Ignore the parse cache. */
  full?: boolean;
  /** Scan without writing anything. */
  dryRun?: boolean;
  /** History message for this scan. */
  message?: string;
  session?: Session;
  /** Absolute paths reported by a file watcher; with a session, only these are re-listed and re-stat'ed. */
  changed?: string[];
  /** With a warm session: patch the changed files' components in without a full scan, when that is exact enough. */
  fast?: boolean;
}

export function loadConfig(root: string, overrides?: Partial<Config>): Config;
export function initConfig(root: string, options?: { autoUpdate?: boolean }): { file: string; created: boolean };
export function knowledgeDir(config: Config): string;

/** Scans the project, writes the catalogue (YAML), agent cards and history, and returns what changed. */
export function scan(config: Config, options?: ScanOptions): ScanResult;
/** The scan alone: builds the catalogue in memory without writing anything. */
export function scanProject(config: Config, options?: { cache?: unknown; previous?: Catalogue }): ScanResult & { cache: unknown };
/** Writes what a session deferred (YAML, caches, agent cards). Returns true when the YAML was written. */
export function flushSession(config: Config, session: Session): boolean;
/** The catalogue half of `frontdex upgrade`: stable IDs, aliases for changed ones, the configured layout. */
export function upgradeCatalogue(config: Config): { aliases: Record<string, string>; sharded: boolean; shardDir: string; commit: HistoryCommit | null } | null;
/** @deprecated use scan(); kept for the 0.1 API. */
export function generate(config: Config): ScanResult;

/** Reads a catalogue in either layout (single YAML/JSON file, or the sharded folder beside it); null when absent. */
export function readCatalogue(file: string): Catalogue | null;
/** Writes a catalogue in the layout `shard` selects and removes the other one; returns the files written. */
export function writeCatalogue(file: string, catalogue: Catalogue, options?: { shard?: boolean | 'auto'; memo?: Map<string, string> }): string[];
/** Validates a catalogue against the JSON Schema, plus references between components and pages. */
export function validateCatalogue(catalogue: unknown): { valid: boolean; errors: string[] };
/** Carries hand-written fields (description, tags, owner, x-*) from `prev` into `next`, in place. */
export function mergeManual(next: Catalogue, prev: Catalogue | null | undefined): void;
export function isSharded(file: string, catalogue: Catalogue, shard?: boolean | 'auto'): boolean;
export function shardDir(file: string): string;

export interface History {
  log(): HistoryCommit[];
  commit(catalogue: Catalogue, options?: { root?: string; message?: string; limit?: number }): HistoryCommit | null;
  /** The catalogue as it was at a commit (id or a prefix of it). */
  checkout(id: string): { entry: HistoryCommit; catalogue: Catalogue } | null;
}
export function createHistory(dir: string): History;

/** Docs a coding agent wrote for one component (spec/enrichment.schema.json). */
export interface ComponentDocs {
  purpose: string;
  summary?: string;
  props?: Record<string, { description: string; howToPass?: string; example?: string }>;
  functions?: Record<string, string>;
  usage?: { title: string; code: string }[];
  notes?: string[];
}
/** A stored docs record: the docs plus the signature of the component they describe. */
export interface EnrichmentRecord {
  id: string;
  name: string;
  file: string;
  sourceHash: string;
  writtenAt: string;
  by?: string;
  doc: ComponentDocs;
}
export function listEnrichment(config: Config): Map<string, EnrichmentRecord>;
export function readEnrichment(config: Config, id: string): EnrichmentRecord | null;
/** Validates and stores docs; throws on schema errors, warns about props the component does not have. */
export function writeEnrichment(config: Config, catalogue: Catalogue, id: string, doc: ComponentDocs, options?: { by?: string }): { record: EnrichmentRecord; warnings: string[] };
/** fresh: written against the current component; stale: it changed since; none: no docs. */
export function enrichmentState(record: EnrichmentRecord | null | undefined, component: Component | undefined): 'none' | 'fresh' | 'stale';
export function enrichmentSummary(config: Config, catalogue: Catalogue): { components: number; documented: number; fresh: number; stale: number };
/** Undocumented or stale components, most used first. */
export function nextToEnrich(config: Config, catalogue: Catalogue, limit?: number): { id: string; c: Component; state: 'none' | 'stale'; score: number }[];

/** The knowledge queries behind the CLI and the frontdex-mcp server (find, show, impact, duplicates, …). */
export function createTools(config: Config): {
  /** MCP-shaped tools: each returns its answer as text content. */
  tools: Record<string, (args?: Record<string, unknown>) => unknown>;
  /** The same queries returning plain data (query, show, impact, …). */
  data: Record<string, (args?: Record<string, unknown>) => unknown>;
  /** Rescans (throttled unless `force`) and returns the current state. */
  refresh: (force?: boolean) => { state: unknown; result: ScanResult | null };
};
