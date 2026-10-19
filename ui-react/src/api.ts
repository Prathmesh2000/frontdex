// Typed access to the `frontdex serve` HTTP API. The UI never loads the whole catalogue: lists are paged.

export interface Issue { type: string; severity: 'high' | 'medium' | 'low' | 'info'; message: string; line?: number; fix?: string; component?: string; file?: string }
export interface ComponentRow { id: string; name: string; kind: string; file: string; line?: number; usedBy: number; pages: number; issues: number }
export interface Page<T> { total: number; offset: number; limit: number; items: T[] }
export interface Info {
  info: { title: string; version?: string; framework?: string; routers?: string[]; packageManager?: string; workspaces?: string[] };
  root: string;
  counts: Record<string, number>;
  issues: Partial<Record<Issue['severity'], number>>;
}
// Component details are the catalogue's Component object; only the fields the UI reads are typed.
export interface Component {
  id: string; name: string; file: string; line?: number; kind: string; export?: string; description?: string; status?: string;
  rendering?: string; tag?: string; element?: string; codeowners?: string[]; tests?: string[]; stories?: string[];
  examples?: { story: string; args?: Record<string, string> }[];
  props?: Record<string, { type: string; required: boolean; default?: string }>;
  state?: Record<string, { source: string; initial?: string }>;
  renders?: string[]; usedBy?: string[]; pages?: string[]; issues?: Issue[];
  apiCalls?: { via: string; method?: string; target?: string; in?: string; line?: number }[];
}
export interface Token { value: string; at: string; source?: string; uses?: number; usedBy?: string[] }
export interface Drift { value: string; at: string; property?: string; token: string; defined?: string; match: 'exact' | 'near'; use: string }

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
  const res = await fetch(`../api/${path}${qs.size ? `?${qs}` : ''}`);
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
  hooks: () => get<Record<string, { file: string; line?: number; reads?: string[]; calls?: string[]; usedBy?: string[] }> | null>('section', { name: 'hooks' }),
};
