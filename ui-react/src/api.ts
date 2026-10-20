// Typed access to the `frontdex serve` HTTP API. The UI never loads the whole catalogue: lists are paged.

export interface Issue { type: string; severity: 'high' | 'medium' | 'low' | 'info'; message: string; line?: number; fix?: string; component?: string; file?: string }
export interface ComponentRow { id: string; name: string; kind: string; file: string; line?: number; usedBy: number; pages: number; issues: number }
export interface Page<T> { total: number; offset: number; limit: number; items: T[] }
export interface Info {
  info: { title: string; version?: string; framework?: string; routers?: string[]; packageManager?: string; workspaces?: string[] };
  root: string;
  counts: Record<string, number>;
  issues: Partial<Record<Issue['severity'], number>>;
  /** True between a watch-mode patch and the full scan that settles project-wide findings. */
  settling?: boolean;
  /** Set when the app runs inside the Vite dev server, which can render single components. */
  livePreview?: string | null;
}
// Component details are the catalogue's Component object; only the fields the UI reads are typed.
export interface Component {
  id: string; name: string; file: string; line?: number; kind: string; export?: string; description?: string; status?: string;
  rendering?: string; tag?: string; element?: string; codeowners?: string[]; tests?: string[]; stories?: string[];
  examples?: { story: string; args?: Record<string, string> }[];
  props?: Record<string, { type: string; required: boolean; default?: string }>;
  state?: Record<string, { source: string; initial?: string }>;
  renders?: string[]; usedBy?: string[]; pages?: string[]; issues?: Issue[]; testedBy?: string[];
  /** Children rendered only under conditions: child id → the conditions (source text) of each place. */
  rendersWhen?: Record<string, string[]>;
  /** Screens switched by state: children per value of one expression. */
  views?: { on: string; cases: Record<string, string[]> }[];
  navigatesTo?: string[];
  apiCalls?: { via: string; method?: string; target?: string; in?: string; line?: number }[];
}
export interface Token { value: string; at: string; source?: string; uses?: number; usedBy?: string[] }
export interface PageInfo { router?: string; file?: string; component?: string; layouts?: string[]; wrappers?: string[]; alternates?: string[]; metadata?: string; rendering?: string; components?: string[]; linksTo?: string[] }
export interface Store { kind: string; name: string; file: string; line?: number; default?: string; readers?: string[]; writers?: string[]; providers?: string[] }
export interface Graph { total: number; truncated: boolean; pages: Record<string, { component?: string; layouts: string[] }>; nodes: Record<string, { name: string; file: string; renders: string[]; usedBy: string[] }> }
type Change = 'added' | 'removed' | 'changed';
/** Docs a coding agent wrote for a component through MCP (spec/enrichment.schema.json). */
export type DocState = 'none' | 'fresh' | 'stale';
export interface Enrichment {
  id: string; name: string; file: string; writtenAt: string; by?: string;
  doc: {
    purpose: string; summary?: string;
    props?: Record<string, { description: string; howToPass?: string; example?: string }>;
    functions?: Record<string, string>;
    usage?: { title: string; code: string }[];
    notes?: string[];
  };
}
export interface EnrichmentOverview {
  summary: { components: number; documented: number; fresh: number; stale: number };
  documented: { id: string; name: string; file: string; purpose: string; writtenAt: string; by?: string; state: DocState }[];
  next: { id: string; name: string; file: string; state: DocState; usedBy: number; pages: number }[];
}

/** A changed field: `from`/`to` for plain values, or the entries added, removed and modified in a map or list. */
export interface DiffField {
  field: string;
  from?: string; to?: string;
  added?: { key: string; after?: string }[];
  removed?: { key: string; before?: string }[];
  modified?: { key: string; before?: string; after?: string }[];
  reordered?: boolean;
}
export interface DiffComponent { id: string; from?: string; change: Change | 'renamed'; details: string[]; fields?: DiffField[]; pages: string[]; dependents: string[]; file?: string }
export interface DiffReport {
  base: string; head: string; error?: string;
  components: DiffComponent[];
  pages: { route: string; change: Change; details: string[] }[];
  endpoints: { key: string; change: Change }[];
  affectedPages: string[]; newIssues: Issue[]; fixedIssues: number;
  newDuplicates: { components: [string, string]; score: number }[]; newDrift: Drift[];
}
export interface Commit { id: string; time: string; git?: string; message?: string; changes: { kind: string; key: string; change: Change }[] }
export interface Drift { value: string; at: string; property?: string; token: string; defined?: string; match: 'exact' | 'near'; use: string }
export interface TestCase { title: string; line?: number; describe?: string[] }
export interface TestMatch { kind: 'page' | 'component'; target: string; via?: string; line?: number; confidence: 'high' | 'medium' | 'low'; reason?: string }
export interface TestSuite {
  kind: 'unit' | 'e2e'; runner?: string; cwd?: string; error?: string; cases: TestCase[];
  components?: string[]; hooks?: string[]; pages?: string[]; matches?: TestMatch[]; unmatched?: { what: string; line?: number; why?: string }[];
}
export interface Tests { runners: Record<string, { cwd: string; config?: string; from?: string[] }>; suites: Record<string, TestSuite>; uncovered: string[]; active: string | null }
export interface RunRequest { file: string; title?: string; kind: TestSuite['kind']; confirm?: boolean }

/**
 * A server path relative to where the app is mounted: `/` for `frontdex serve`, `/__frontdex/` inside the Vite dev
 * server, or the legacy `/v2/` alias (one level down, so `..`).
 */
export const appUrl = (p: string) => (location.pathname.endsWith('/v2/') ? '../' : './') + p;

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const res = await fetch(appUrl(`api/${path}${qs.size ? `?${qs}` : ''}`));
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export const api = {
  info: () => get<Info>('info'),
  components: (p: { q?: string; offset?: number; limit?: number }) => get<Page<ComponentRow>>('components', p),
  component: (id: string) => get<Component>('component', { id }),
  issues: (p: { severity?: string; type?: string; offset?: number; limit?: number }) => get<Page<Issue>>('issues', p),
  tokens: () => get<{ definitions: Record<string, Token>; drift?: Drift[] } | null>('section', { name: 'tokens' }),
  duplicates: () => get<{ components: [string, string]; score: number; reasons?: string[] }[] | null>('section', { name: 'duplicates' }),
  pages: () => get<Record<string, PageInfo>>('pages'),
  folders: (path: string) => get<{ path: string; dirs: { name: string; path: string; count: number; withIssues: number }[]; items: ComponentRow[] }>('folders', { path }),
  source: async (file: string) => {
    const res = await fetch(appUrl(`api/source?file=${encodeURIComponent(file)}`));
    if (!res.ok) throw new Error(res.status === 404 ? 'source not available' : res.statusText);
    return res.text();
  },
  stores: () => get<Record<string, Store> | null>('section', { name: 'stores' }),
  graph: (p: { focus?: string; depth?: number; dir?: string; force?: 1 }) => get<Graph>('graph', p),
  diff: (base: string, head?: string) => get<DiffReport>('diff', { base, head }),
  history: () => get<Commit[]>('history'),
  enrichment: (id: string) => get<{ id: string; state: DocState; record: Enrichment | null }>('enrichment', { id }),
  enrichmentOverview: () => get<EnrichmentOverview>('enrichment'),
  hooks: () => get<Record<string, { file: string; line?: number; reads?: string[]; calls?: string[]; usedBy?: string[] }> | null>('section', { name: 'hooks' }),
  tests: () => get<Tests>('tests'),
  /** Starts a run; its output streams from api/tests/runs/<id> (Server-Sent Events). */
  runTest: async (body: RunRequest) => {
    const res = await fetch(appUrl('api/tests/run'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    return data as { id: string; command: string };
  },
};
