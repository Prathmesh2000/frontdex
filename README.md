# react-catalogue

A living knowledge base for React and Next.js frontends, like Swagger/OpenAPI for your UI. It scans the source and keeps two views of the same knowledge up to date:

- **For developers:** `catalogue.yaml` (the [CatalogueSpec](docs/SPEC.md) format) plus a page-first UI:
  - **Navigation:** URL → layouts → component → its state, props, functions, timers, API calls, global state, validation and styles. Every item links to its `file:line`.
  - **Diagnostics:** memory leaks, render loops, unsafe async updates, stale dependencies, and dead code.
- **For coding agents:** `.catalogue/agent/` (compact Markdown cards and a JSON graph), an MCP server, always-on rules and hooks for Claude Code, Cursor, OpenCode, Hermes, Copilot and anything that reads `AGENTS.md`.

```mermaid
flowchart LR
  Src[React / Next source] -->|rcat scan| Scan[Incremental scanner<br/>re-parses changed files only]
  Auto["autoUpdate<br/>rcat watch · Next/Vite plugin"] --> Scan
  Scan --> Yaml[catalogue.yaml]
  Scan --> Hist[.catalogue/history<br/>git-like snapshots]
  Scan --> Agent[.catalogue/agent<br/>INDEX.md · cards · graph.json]
  Yaml --> UI[rcat serve<br/>explorer · graph · history]
  Agent --> Rules[AGENTS.md · CLAUDE.md · .cursor/rules]
  Agent --> MCP[rcat mcp]
  Hooks[agent hooks after each edit] --> Scan
```

## Quick start

```bash
npm install --save-dev react-catalogue      # or: yarn add -D react-catalogue
npx rcat init --auto-update                 # writes catalogue.config.json
npx rcat scan                               # builds the knowledge base
npx rcat agents                             # wires coding agents (rules, MCP, hooks)
npx rcat serve                              # UI at http://localhost:4400
```

Until it is published on npm: `npm install --save-dev github:Prathmesh2000/frontend-catalog`.

## Commands

| Command | What it does |
|---|---|
| `rcat init [--auto-update]` | Creates `catalogue.config.json`. |
| `rcat scan [--full] [-m msg]` | Incremental rescan: unchanged files (same mtime/size or content hash) reuse their cached parse. `--full` ignores the cache. Records a history snapshot when anything changed. |
| `rcat watch` | Keeps everything updated while you code. This is what `autoUpdate` runs. |
| `rcat check` | Exits 1 if the catalogue is stale. Use in CI or a pre-commit hook. |
| `rcat history [id] [-n 20]` | Log of knowledge-base snapshots; pass an id for the full change list. |
| `rcat serve` / `rcat start` | UI server. Auto-updates and live-reloads when `autoUpdate` is on (or with `-w`). |
| `rcat build [-o dir]` | Static export of the UI, history included. |
| `rcat query "<filters>"` | Search from the terminal, e.g. `rcat query "uses:Button is:shared"`. |
| `rcat show <Component>` / `rcat impact <Component>` | Component card / everything that depends on it. |
| `rcat dataflow <Component>` | Props in (per parent, with values) → store reads → state/effects → API calls, dispatches → props out. |
| `rcat health [type] [--severity high] [--strict]` | Leaks, render loops, async/unmount bugs, stale deps, dead code. `--strict` exits 1 on high-severity issues (CI). |
| `rcat state [store]` / `rcat api [endpoint]` | Global state map with readers/writers; every API call grouped by endpoint. |
| `rcat agents [--targets …] [--no-hooks] [--no-mcp] [--remove]` | Installs or removes agent integration. |
| `rcat mcp` | MCP server over stdio (registered automatically by `rcat agents`). |
| `rcat validate [file]` | Validates against the JSON Schema. |

All commands accept `-C <dir>` to target another project.

## Auto-update

With `"autoUpdate": true`, `rcat serve` watches the source. To keep the knowledge base current while your normal dev server runs, use one of:

```js
// next.config.js: runs `rcat watch` next to `next dev`, stops with it
const { withCatalogue } = require('react-catalogue/next');
module.exports = withCatalogue({ reactStrictMode: true });
```

```js
// vite.config.js
import catalogue from 'react-catalogue/vite';
export default { plugins: [react(), catalogue()] };
```

or `"dev": "rcat watch & next dev"` in `package.json`. A burst of saves triggers one scan (250 ms debounce). A file that is broken mid-edit keeps its last good version instead of disappearing.

## History

Every scan that changes the catalogue records a snapshot, like a commit: id, time, git HEAD, message and a field-level change list (`ProductCard props +size`, `Header state −query`, `page /checkout added`). Line-number shifts are ignored. Objects are content-addressed and packed per snapshot, so unchanged components cost nothing.

- **CLI:** `rcat history`, `rcat history <id>`
- **UI:** the **History** page and the **History** tab on each component
- **Agents:** the `catalogue_history` MCP tool

History lives in `.catalogue/history/`, which is git-ignored by default. Remove `history/` from `.catalogue/.gitignore` to share it.

## Coding agents

`rcat agents` installs, idempotently and between `<!-- react-catalogue -->` markers so your own content is untouched:

| Agent | Rules (always loaded) | Tools | After-edit feedback |
|---|---|---|---|
| Claude Code | `AGENTS.md`, or an `@.catalogue/agent/RULES.md` import in an existing `CLAUDE.md` | `.mcp.json` | `PostToolUse` + `SessionStart` hooks in `.claude/settings.json` |
| Cursor | `.cursor/rules/react-catalogue.mdc` (`alwaysApply`) + `AGENTS.md` | `.cursor/mcp.json` | `postToolUse` + `sessionStart` in `.cursor/hooks.json` |
| OpenCode | `AGENTS.md` | `opencode.json` | – |
| Hermes | `AGENTS.md` (or an existing `.hermes.md`) | `~/.hermes/config.yaml` (user-level; snippet printed) | – |
| Copilot / others | `.github/copilot-instructions.md`, `AGENTS.md` | – | – |

The rules require agents to:
1. search before creating a component;
2. read a component's card before editing it;
3. check its impact before changing props or exports;
4. rescan afterwards.

The hooks make this hard to skip:
- After every file edit, the agent receives what changed and who is affected, e.g. `ProductGrid changed: props +title. Rendered by: Page. Pages: /`.
- `rcat check` in CI fails a PR whose catalogue is stale.

MCP tools:
- `catalogue_search`
- `catalogue_component`
- `catalogue_dataflow`
- `catalogue_impact`
- `catalogue_page`
- `catalogue_state`
- `catalogue_api`
- `catalogue_styles`
- `catalogue_health`
- `catalogue_overview`
- `catalogue_rescan`
- `catalogue_history`

The rules also tell agents to reuse existing stores, endpoints and CSS classes, and never to ship an effect without cleanup.

The server speaks both the stateless 2026-07-28 MCP revision and the older initialize-handshake revisions.

## The UI

```
Site map ─ URL map (route → layouts → page component, API/state/issue counts) · "What to do next" · global state
 └─ Page /checkout ─ Structure tree · Data & APIs · live Preview (iframe of your dev server) · Health · Graph
     └─ Component ─ trail breadcrumb (/checkout › RootLayout › CheckoutLayout › CheckoutPage › CheckoutWizard)
         ├─ Data flow   inputs (parent props with values, store/context reads) → state → effects/handlers → API/dispatch/timers → children
         ├─ Family      every path from a page, parents + the props they pass, siblings, children + the props they receive
         ├─ Internals   state (and what updates it), props (and what each parent passes), variables, functions, hooks, refs
         ├─ Lifecycle   mount/update/unmount matrix, every timer/listener/subscription and whether it is released
         ├─ API & state endpoints, Redux/context/zustand reads & writes, validation rules
         ├─ Styles      class → defining file:line, CSS modules, stylesheets
         └─ Health · Source · History
Global state · Health (leaks, loops, dead code, API map) · Components explorer · Graph · History
```

- **Sidebar:** the same page-first tree. Expand a route into its layouts and components, and expand a component into its State / Props / Functions / Effects / Timers / API / Store / Issues.
- **Source:** every `file:line` opens the source in a side panel, and there's a VS Code button.
- **Rescan:** the top bar has a Rescan button, and auto-update keeps the open tab live.
- **Search:** `Ctrl K` searches pages, components, stores, endpoints, folders and hooks.

Query language (combine freely, prefix `-` to negate):

```
kind:class  hook:useEffect  prop:onClick  state:loading  ctx:Theme  uses:Button  in:Header
page:/checkout  dir:components/ui  ext:next/image  tag:forms  owner:web-core
api:/orders  store:cart  issue:memory-leak  timer:interval  class:btn  var:total  fn:handleSubmit
has:state|props|effects|context|refs|children|docs|api|store|validation|issues|leaks|timers
is:unused|shared|heavy|page|layout|leaf|deprecated|undocumented|leaky
```

## Configuration

`catalogue.config.json` (every key optional):

```json
{
  "title": "shop-web",
  "include": ["."],
  "exclude": ["**/node_modules/**", "**/.next/**", "**/*.test.*", "**/*.stories.*"],
  "output": "catalogue.yaml",
  "port": 4400,
  "preview": "http://localhost:3000",
  "autoUpdate": true,
  "knowledgeDir": ".catalogue",
  "history": { "enabled": true, "limit": 500 },
  "agents": { "enabled": true }
}
```

`preview` is where your dev server runs, for the live Preview tab. The default is `:3000` for Next, `:5173` for Vite. `tsconfig.json` / `jsconfig.json` path aliases are resolved automatically.

## Files it creates

```
catalogue.yaml                 human spec: commit it, review it, hand-edit description/tags/owner/x-*
.catalogue/
  agent/INDEX.md               agent entry point: rules, pages, folders, shared components (commit it)
  agent/components/<dir>.md    one card per component, mirroring the source folder
  agent/graph.json             machine-readable graph
  agent/RULES.md               rules imported by CLAUDE.md
  history/                     snapshots (git-ignored by default)
  cache/                       incremental-scan cache (git-ignored)
```

## What gets detected

| Area | Supported |
|---|---|
| Components | function declarations, arrow functions, default exports (named or anonymous), `memo`, `forwardRef`, class components |
| Props | TS param types, `FC<Props>`, `forwardRef<Ref, Props>`, interfaces with `extends`, intersections, `PropsWithChildren`, destructuring defaults, `propTypes`, `defaultProps`, `props.x` usage |
| State | `useState`, `useReducer`, class `state` / `this.state` |
| Lifecycle | effect hooks (deps → mount/update, cleanup → unmount) and all class lifecycle methods, with the functions each one calls |
| Routing | Next.js App Router (groups, parallel slots, dynamic segments, nested layouts), Pages Router (`_app`), React Router JSX and object routes |
| Imports | relative paths, tsconfig aliases, barrels, namespace imports, `lazy()` / `next/dynamic`, compound components (`<Tabs.List>`, `Card.Header = …`, `Object.assign`) |
| Global state | Redux Toolkit (`createSlice`, `configureStore`, thunks, `useSelector`/`useAppSelector`, `dispatch`, `connect`), React context (incl. through custom hooks), zustand |
| Data & validation | `fetch`, axios-style clients, SWR, React Query, service modules; zod, yup, react-hook-form, HTML constraints, custom validators |
| Styles | `className` strings, template literals, `clsx`/`cn`, CSS modules, global stylesheets (class → `file:line`) |
| Diagnostics | memory leaks, render loops, side effects in render, unsafe async updates, missing deps, unused variables/functions/props/state/imports/exports/files/components, deprecated usage |

## Performance

Measured on a synthetic project with 1,800 files and 1,577 components (the full deep analysis):

| Operation | Time |
|---|---|
| Cold scan | 7.5 s (about 4 ms per file) |
| No-change rescan | under 1 s, including Node startup |
| One-file rescan | well under 1 s |
| UI first load | about 110 ms |
| Most navigation | under 50 ms |
| Health and Global state views | 250–350 ms |

## Samples

| Sample | Contents |
|---|---|
| [examples/next-app](examples/next-app) "Northwind Shop" | Next.js App Router: storefront, checkout, account and admin; Redux Toolkit, contexts, zustand, axios, SWR, zod, react-hook-form, CSS modules |
| [examples/react-app](examples/react-app) "Acme Admin" | React Router `createBrowserRouter`, Redux + `connect`, yup, class components with every lifecycle method |

Both samples contain deliberate memory leaks, a render loop, stale dependencies and dead code, each marked `// demo:`, so every catalogue feature has something to show.

## Development

```bash
npm install && npm test
node bin/rcat.js serve -C examples/next-app -w
```

## Limits

Static analysis only: components produced by factories and routes built from runtime data are not followed. Custom hooks are recorded on their callers but not catalogued on their own yet.
