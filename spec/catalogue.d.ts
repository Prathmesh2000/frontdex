// Generated from spec/catalogue.schema.json by scripts/schema-types.js. Do not edit: run `npm run gen:types`.

/** CatalogueSpec 1.1 */
export interface Catalogue {
  catalogue: "1.0" | "1.1";
  info: Info;
  components: {
    [k: string]: Component;
  };
  pages: {
    [k: string]: Page;
  };
  /** Server entry points defined by the frontend: route handlers, API routes, resource routes, middleware, server actions. */
  endpoints?: {
    [k: string]: Endpoint;
  };
  stores?: {
    [k: string]: Store;
  };
  styles?: {
    [k: string]: Stylesheet;
  };
  /** Design tokens (CSS custom properties, Tailwind theme) and hard-coded values that drift from them. */
  tokens?: {
    definitions?: {
      [k: string]: {
        value: string;
        at: string;
        source?: "css" | "tailwind" | "theme";
        /** References: classes resolving to it and var() uses in stylesheets. */
        uses?: number;
        /** Components using it through Tailwind classes. */
        usedBy?: string[];
      };
    };
    drift?: ({
      value: string;
      at: string;
      property?: string;
      token: string;
      defined?: string;
      match: "exact" | "near";
      use?: string;
    })[];
  };
  /** Pairs of components that look like duplicates, best match first. */
  duplicates?: {
    components: [string, string];
    score: number;
    reasons?: string[];
  }[];
  /** Custom hooks: where they are defined, the stores/contexts they read, the hooks they call, and the components using them. */
  hooks?: {
    [k: string]: {
      file: string;
      line?: number;
      reads?: string[];
      calls?: string[];
      usedBy?: string[];
    };
  };
  /** Unit and E2E test files mapped onto components and pages: which runner runs each, its cases, and what it covers. */
  tests?: {
    /** Test runners found (jest, vitest, playwright, cypress), keyed by name; a second project folder using the same runner is keyed "<name> (<cwd>)". */
    runners: {
      [k: string]: {
        /** Folder the runner is started in, relative to the project root. */
        cwd: string;
        /** Runner config file in that folder. */
        config?: string;
        /** Where the runner was detected. */
        from?: ("package.json" | "scripts" | "config" | "import")[];
      };
    };
    /** One entry per test file, keyed by its path relative to the project root (may start with ../ for tests.dirs outside it). */
    suites: {
      [k: string]: {
        kind: "unit" | "e2e";
        runner?: "jest" | "vitest" | "playwright" | "cypress";
        /** Folder the runner starts in, relative to the project root. */
        cwd?: string;
        /** Why the file could not be parsed. */
        error?: string;
        cases: {
          title: string;
          line?: number;
          /** Enclosing describe titles, outermost first. */
          describe?: string[];
        }[];
        /** ComponentIds: rendered by a unit test, or matched by an E2E locator. */
        components?: string[];
        /** HookIds exercised with renderHook(). */
        hooks?: string[];
        /** Page routes an E2E spec visits. */
        pages?: string[];
        /** E2E evidence: each visited URL or locator mapped to a page or component, with how sure the match is (high: test id or full URL; medium: role/label/placeholder name; low: plain text). */
        matches?: ({
          kind: "page" | "component";
          target: string;
          via?: string;
          line?: number;
          confidence: "high" | "medium" | "low";
          reason?: string;
        })[];
        /** E2E visits and locators that matched nothing, and why. */
        unmatched?: {
          what: string;
          line?: number;
          why?: string;
        }[];
      };
    };
  };
  health?: Health;
  aliases?: Aliases;
  [k: `x-${string}`]: unknown;
}

/** Former ComponentIds / HookIds that changed (e.g. the file moved) → the current ID, so old references keep resolving. Chains are collapsed; an alias is dropped once its old ID is live again or its target is gone. */
export interface Aliases {
  [k: string]: string;
}

export type StringList = string[];

export interface Info {
  title: string;
  version?: string;
  description?: string;
  framework?: "react" | "next";
  /** Detected from the packageManager field or the lockfile. */
  packageManager?: "npm" | "pnpm" | "yarn" | "yarn-berry" | "yarn-pnp" | "bun";
  /** Workspace (monorepo) package names. */
  workspaces?: string[];
  routers?: ("next-app" | "next-pages" | "react-router" | "react-router-v7" | "remix" | "tanstack" | "gatsby" | "solid-start" | "qwik-city" | "nuxt" | "vue-router" | "sveltekit" | "astro" | "html" | "angular-router")[];
  generator?: string;
  generatedAt?: string;
  [k: `x-${string}`]: unknown;
}

export interface Component {
  name: string;
  file: string;
  /** Workspace package that contains the component (monorepos only). */
  workspace?: string;
  line?: number;
  kind: "function" | "class" | "memo" | "forwardRef" | "styled";
  /** Custom element tag (customElements.define / @customElement). */
  tag?: string;
  /** HTML element a styled component renders (styled.button → button). */
  element?: string;
  export?: "default" | "named" | "none";
  /** App Router only: client when its module, or a component that renders it, has 'use client'. */
  rendering?: "client" | "server";
  description?: string;
  status?: "experimental" | "stable" | "deprecated";
  tags?: StringList;
  owner?: string;
  /** Owners from the CODEOWNERS file (last matching rule). */
  codeowners?: string[];
  /** Test files for the component, relative to its folder. */
  tests?: string[];
  /** Test files (keys of tests.suites, relative to the project root) whose tests render this component or, for E2E specs, touch its text, labels or test ids. */
  testedBy?: string[];
  /** Story files (Storybook/Ladle CSF) for the component, relative to its folder. */
  stories?: string[];
  /** Stories (CSF) as usage examples: "<file>#<Story>" and the args (props) each renders with. */
  examples?: {
    story: string;
    args?: {
      [k: string]: string;
    };
  }[];
  props?: {
    [k: string]: Prop;
  };
  state?: {
    [k: string]: State;
  };
  context?: StringList;
  refs?: StringList;
  hooks?: Hook[];
  lifecycle?: LifecycleEvent[];
  renders?: StringList;
  /** Children rendered only under conditions: child id → the conditions (source text) of each place it is rendered, e.g. "!loading && tab === 'users'", "each of items", "via blockRegistry". */
  rendersWhen?: {
    [k: string]: StringList;
  };
  /** Screens switched by state rather than routes: children shown for each value of one expression (tabs, steps). */
  views?: {
    on: string;
    cases: {
      [k: string]: StringList;
    };
  }[];
  /** Pages (route keys) or paths this component links or navigates to: Link/NavLink/Navigate, <a href>, navigate(), router.push. */
  navigatesTo?: StringList;
  externals?: StringList;
  usedBy?: StringList;
  pages?: StringList;
  variables?: Variable[];
  functions?: Function[];
  timers?: Timer[];
  apiCalls?: ApiCall[];
  store?: {
    reads?: StoreRead[];
    writes?: StoreWrite[];
  };
  validation?: Validation[];
  styles?: ComponentStyles;
  issues?: Issue[];
  passes?: {
    [k: string]: PassedProp[];
  };
  [k: `x-${string}`]: unknown;
}

export interface Prop {
  type: string;
  required: boolean;
  default?: string;
  description?: string;
  [k: `x-${string}`]: unknown;
}

export interface State {
  source: "useState" | "useReducer" | "class" | "ref" | "reactive" | "computed" | "data" | "$state" | "let" | "field" | "x-data" | "signal";
  initial?: string;
  setter?: string;
  type?: string;
  reducer?: string;
}

export interface Hook {
  name: string;
  category: "state" | "effect" | "context" | "ref" | "memo" | "router" | "data" | "custom";
  count?: number;
}

export interface LifecycleEvent {
  via: string;
  phases: ("mount" | "update" | "unmount" | "error")[];
  deps?: StringList;
  calls?: StringList;
  cleanup?: StringList;
  line?: number;
}

export interface Page {
  router: "next-app" | "next-pages" | "react-router" | "react-router-v7" | "remix" | "tanstack" | "gatsby" | "solid-start" | "qwik-city" | "nuxt" | "vue-router" | "sveltekit" | "astro" | "html" | "angular-router";
  file: string;
  /** Workspace package that serves the page (monorepos only). */
  workspace?: string;
  component?: string;
  params?: StringList;
  layouts?: StringList;
  /** Guards and providers wrapping the page component in the route element, outermost first. */
  wrappers?: StringList;
  /** Other components the route can show instead of the page (loaders, redirects, conditional branches). */
  alternates?: StringList;
  /** Pages (route keys) or paths the components of this page link or navigate to. */
  linksTo?: StringList;
  /** Next.js metadata export: a metadata object or generateMetadata. */
  metadata?: "static" | "dynamic";
  components?: StringList;
  description?: string;
  tags?: StringList;
  [k: `x-${string}`]: unknown;
}

export interface Variable {
  name: string;
  kind?: string;
  value?: string;
  line?: number;
  used?: boolean;
}

export interface Function {
  name: string;
  line?: number;
  kind?: "handler" | "helper" | "method";
  async?: boolean;
  params?: string;
  calls?: StringList;
  sets?: StringList;
  used?: boolean;
  memoized?: boolean;
}

export interface Timer {
  type: "interval" | "timeout" | "animation-frame" | "idle-callback" | "listener" | "subscription" | "observer" | "socket";
  call: string;
  event?: string;
  in?: string;
  line?: number;
  cleared?: boolean | null;
}

export interface ApiCall {
  via: string;
  method?: string;
  target?: string;
  module?: string;
  in?: string;
  line?: number;
}

export interface StoreRead {
  via: string;
  kind: "redux" | "zustand" | "context";
  path?: string;
  store?: string;
  storeId?: string;
  line?: number;
}

export interface StoreWrite {
  via: string;
  kind?: "redux" | "zustand" | "context";
  action: string;
  in?: string;
  storeId?: string;
  line?: number;
}

export interface Validation {
  via: string;
  schema?: string;
  field?: string;
  fn?: string;
  rules?: StringList;
  line?: number;
}

export interface ClassRef {
  name: string;
  at?: string;
  /** Tailwind theme token the utility class resolves to. */
  token?: string;
}

export interface ComponentStyles {
  classes?: ClassRef[];
  modules?: {
    file: string;
    classes?: ClassRef[];
  }[];
  sheets?: StringList;
}

export interface Issue {
  type: string;
  severity: "high" | "medium" | "low" | "info";
  message: string;
  line?: number;
  fix?: string;
}

export interface PassedProp {
  name: string;
  value?: string;
  line?: number;
}

export interface Store {
  kind: "redux-slice" | "context" | "zustand";
  name: string;
  file: string;
  line?: number;
  key?: string;
  state?: StringList;
  actions?: StringList;
  thunks?: StringList;
  default?: string;
  readers?: StringList;
  writers?: StringList;
  providers?: StringList;
}

export interface Stylesheet {
  module?: boolean;
  classes?: number;
  importedBy?: StringList;
}

export interface Health {
  issues?: {
    [k: string]: number;
  };
  byType?: {
    [k: string]: number;
  };
  unusedComponents?: StringList;
  unusedExports?: {
    file: string;
    name: string;
  }[];
  unusedFiles?: StringList;
  unusedImports?: {
    file: string;
    name: string;
    source?: string;
    line?: number;
  }[];
}

export interface Endpoint {
  kind: "route-handler" | "api-route" | "resource-route" | "middleware" | "server-action";
  file: string;
  methods?: string[];
  workspace?: string;
  /** Files importing a server action. */
  importedBy?: string[];
  description?: string;
  [k: `x-${string}`]: unknown;
}
