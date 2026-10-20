# Changelog

All notable changes to frontdex (formerly react-catalogue). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Short hashes point at the commit that made the change.

## 0.4.0 (2026-10-20)

### Added

- **Antigravity**: `frontdex agents --targets antigravity` writes an always-on rule to `.agents/rules/frontdex.md` and registers the MCP server in `.agents/mcp_config.json`.
- **`frontdex agents --user-config`**: also registers the MCP server in Hermes' `~/.hermes/config.yaml` (comments kept, backup saved as `config.yaml.bak`).
- **Docs for users and contributors**: [docs/AGENTS.md](docs/AGENTS.md) (automatic and copy-paste setup per agent), [docs/USAGE.md](docs/USAGE.md) (full reference, moved out of the README), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), `CONTRIBUTING.md`, `AGENTS.md` for agents working on this repo, `llms.txt`.
- **Releases from GitHub Actions**: CI on every PR; a manual Release workflow publishes to npm with provenance (Trusted Publishing) and creates the GitHub Release from this changelog.
- **Conditional rendering**: every child records the conditions it renders under (ternary branch, `&&`/`||`, if/else, switch case, earlier early returns, `.map` loops) as `rendersWhen`; screens switched by state (tabs, steps, popups) as `views`. Shown on component pages, in agent cards and in `catalogue_component`. (`fd49956`, `442e747`)
- **Navigation**: `Link`/`NavLink`/`Navigate`, `<a href>`, `navigate()` and `router.push` targets resolved to pages (`navigatesTo` on components, `linksTo` on pages; "Links to" and "Linked from" in the page view). (`fd49956`)
- **Registry renders**: components rendered from block registries, column `renderCell` definitions and helper functions are credited to the components that use them. (`fd49956`)
- **Routes from static data**: `<Route path={item.route}>` inside `.map()` over const arrays, const aliases or imported JSON files is expanded into one page per value. (`70d4775`)
- **Reviewable diffs**: `frontdex diff`, `catalogue_diff`, the PR comment and the UI Changes view show each changed entry with its value before and after; the PR comment and the UI add an impact graph. (`463c9d5`)
- **Tests**: unit tests (Jest, Vitest, Testing Library) and E2E specs (Playwright, Cypress) mapped to components and pages; a Tests view with run buttons (no shell; E2E asks for confirmation); `frontdex tests`; `catalogue_tests`; `"tests": { "dirs": [...] }` for specs outside the scanned folder. (`7d16c79`)
- **Component docs from coding agents**: through frontdex-mcp an agent writes a component's purpose, props and how to pass them, functions, usage and notes into `.frontdex/enrichment/`; a Storybook-style Docs card per component and a Docs view; docs go stale when the component changes. Public API: `listEnrichment`, `readEnrichment`, `writeEnrichment`, `enrichmentState`, `enrichmentSummary`, `nextToEnrich`. (`eedfa4e`, `e08ec62`)
- Agent rules ask agents to run the tests covering a change and to keep component docs current.

### Changed

- **License: Apache-2.0** (was MIT). Free for any use, including commercial; redistributions keep the `LICENSE` and `NOTICE` files, which credit the author. Versions up to 0.3.x stay MIT.
- The npm package no longer includes the internal plan (`docs/TASK.md`); only `docs/SPEC.md` and `docs/MIGRATING.md` ship. (`46cef68`)

### Fixed

- `frontdex diff <ref>` and the PR comment rescanned the base ref instead of reading its committed `frontdex.yaml` when the project path was a Windows short (8.3) path, e.g. under `C:\Users\RUNNER~1` on GitHub-hosted Windows runners.

## 0.3.1 (2026-10-20)

First release under the frontdex name. 0.3.0 contains the same code: its staged publish went live only after 0.3.1 had been prepared, so both are on npm. Use 0.3.1.

Everything after 0.2.0 (`f4e0a9b`). The package is renamed in this release; see [docs/MIGRATING.md](docs/MIGRATING.md) to move a react-catalogue 0.2 project over.

### Changed

- **Renamed react-catalogue to frontdex** (`9f1c0de`). The package is `frontdex`; the CLI is `frontdex`, with `fdx` as a short alias and `rcat` / `react-catalogue` kept for existing scripts. New projects use `frontdex.config.json`, `frontdex.yaml` and `.frontdex/`. Projects that still have `catalogue.config.json`, `catalogue.yaml` or `.catalogue/` keep those names and print a one-line notice on `init`, `scan`, `watch`, `serve` and `check` until you run `frontdex upgrade`.
- The Next.js plugin exports `withFrontdex` from `frontdex/next`; `withCatalogue` is still exported under that name. The Vite plugin is named `frontdex`.
- `frontdex agents` replaces react-catalogue rule blocks, MCP server entries, hooks and the Cursor rule file instead of adding a second copy. Agent rules and cards name the project's actual knowledge folder and YAML file.
- **The MCP server moved to its own package, [frontdex-mcp](https://github.com/Prathmesh2000/frontdex-mcp)** (`f4a2183`). `frontdex mcp` starts it from your project when it is installed, so existing `.mcp.json` entries keep working once you `npm i -D frontdex-mcp`. Without it, `frontdex mcp` exits 1 and tells you what to install. The knowledge queries stay in this package as the public `createTools` API.
- **The React UI is the default** (`7623452`). `frontdex serve` serves it at `/` (also `/v2/`); the previous UI moved to `/classic/` and is still what `frontdex build` exports as a static site.
- The local server binds to `127.0.0.1` by default (`ce0c398`). Set `FRONTDEX_HOST` to listen on other interfaces.
- Component IDs are stable across rescans (`43ef03c`). An ID is kept from the previous catalogue, matched by name and file. A new component with an existing name in another file gets `name@file` instead of renaming the one already there. Cold scans keep the 1.x ID rule, so a fresh scan produces the same output as before.
- Possible-duplicate issues: one per component, naming its best match plus a count of the rest, instead of one per look-alike pair (`52d53a0`). At 22.5k files the old behaviour produced about 2.4 million issues and crashed serialisation (V8 maximum string length); the cold scan now finishes in 84 s.
- `loadConfig` makes the project root absolute (`4829cef`). A relative root used to disable tsconfig `paths` resolution silently for programmatic callers.
- Default excludes now cover framework build folders: `.svelte-kit`, `.nuxt`, `.output`, `.astro`, `.cache`, `.vercel` (`357896e`).

### Added

**Upgrade path**

- `frontdex upgrade` (`9f1c0de`, `43ef03c`): moves `catalogue.config.json` to `frontdex.config.json`, `catalogue.yaml` to `frontdex.yaml` and `.catalogue/` to `.frontdex/`, then rescans to fix stable IDs, record aliases and apply the shard layout.
- `react-catalogue` 0.3.0 compatibility package in `compat/react-catalogue` (`fbefff5`, prepared, not published). It depends on frontdex and maps every 0.2 entry point (`.`, `/next`, `/vite`, `/query`, `/schema.json`) onto it. `rcat` and `react-catalogue` run the frontdex CLI after a notice on stderr; importing it emits a `DeprecationWarning`. frontdex now exports `./package.json` so this package can locate the CLI.

**Catalogue format**

- Top-level `aliases` map (`43ef03c`): when a component's ID changes because its file moved, the old ID maps to the new one. Manual fields, history and CI diffs follow aliases and report the change as `renamed`. Lookups by an old ID resolve through it (`9755dad`).
- Sharded layout (`43ef03c`): the `shard` option writes `frontdex/index.yaml` plus per-folder files under `frontdex/components/`. It turns on automatically above 500 components and stays on once set; `true` / `false` force it. Watch sessions rewrite only the shards that changed. `readCatalogue` and `frontdex validate` read both layouts.
- Published TypeScript types (`09753e5`): `spec/catalogue.d.ts` generated from the JSON Schema, a hand-written `src/index.d.ts` for the public API, and declarations for the Vite, Next and webpack plugins. Package `exports` carry `types` conditions.

**Frameworks and routers**

- Vue (`.vue` via the project's own `vue/compiler-sfc`), Vue Router and Nuxt `pages/` (`fb015c1`).
- Svelte 4 and 5 (via the project's own `svelte/compiler`) and SvelteKit routes, `+server.ts` handlers and form actions (`357896e`).
- Astro (via the project's own `@astrojs/compiler`), `src/pages` routes and endpoints, framework islands (`5a4d4b7`).
- Angular `@Component` classes with inputs, outputs, signals, HttpClient calls and templates; Angular `loadComponent` routes (`8d0150a`).
- Solid and Qwik signal state (`8d0150a`).
- Web Components and Lit; plain HTML sites, with htmx, Alpine and Stimulus detection. HTML files are scanned only in projects without a JS framework; the `html` config option overrides that (`f0666b5`).
- Routers: React Router v7 framework mode, Remix v2 flat routes, TanStack Router, Gatsby, SolidStart and Qwik City (`b0d7761`).
- React Router: route paths built from constants, template literals and string operations; conditional and wrapped route elements; nested `<Routes>` under `/parent/*`; route files unreachable from the app entry are ignored (`92f80a4`).
- Next.js server side: route handlers, Pages API routes, middleware and server actions as endpoints; client/server rendering per App Router component; static/dynamic page metadata; a `client-code-in-server-component` issue (`b0d7761`).
- Monorepos (`436ec2b`): package manager detection (npm, pnpm, Yarn classic, Yarn berry and PnP, from `packageManager` or lockfiles); workspaces from `package.json`, `pnpm-workspace.yaml` or `lerna.json`; workspace package imports resolved to source; the nearest `tsconfig`/`jsconfig` per file, following `extends`.

**Analysis**

- Duplicate components and design-token drift (`7ba2ea4`), with `frontdex find`, `frontdex dupes` and `frontdex tokens`.
- CSS-in-JS (styled-components, Emotion), JS theme objects as tokens, and Tailwind classes resolved to theme tokens (`cf0ffba`).
- Accessibility checks for JSX, Vue templates and HTML pages (`ecf980f`), extended to Svelte, Astro and Angular templates (`613e537`).
- Hard-coded text, reported only when the project depends on an i18n library (`ecf980f`).
- CODEOWNERS, test and story files per component; `frontdex owners` and `frontdex adoption` (`ecf980f`).
- Custom hooks catalogue and `frontdex hooks` (`4829cef`).
- CSF story files become component examples with their args (`a79ea49`).
- Heavy-import issues for client code (moment, lodash CJS, `chart.js/auto`, aws-sdk v2 and others), each naming a lighter alternative (`a79ea49`).

**CLI**

- `frontdex fix`: removes unused imports; `--tokens` replaces stylesheet literals that exactly match a CSS token with `var(--token)`; `--dry-run`, `--json` (`a79ea49`).
- `frontdex doctor`: reports detected config, frameworks, package manager, workspaces, compilers, routers, agents and git, with a hint per gap. Exits 1 on errors (`7590a68`).
- `--json` on every query command plus `scan`, `check` and `history` (`7590a68`).
- `frontdex --version` (`7623452`).

**Pull requests and CI** (`7e2ae2c`)

- `frontdex diff [base] [head]`: field-level catalogue diff between git refs, the pages each change reaches, issues introduced and fixed, new duplicates and token drift. Text, `--json` or `--markdown`; `--fail-on` sets an exit-code gate; `--scan` forces scanning a temporary worktree instead of reading committed YAML.
- `frontdex pr-comment` and a GitHub Action (`integrations/github-action`) that posts one sticky PR comment and a job summary.

**UI**

- React + Vite UI (`cd674ec`, `17f5487`, `7623452`): overview, virtualised paged component list, component detail, health, design, hooks, site map, page, state, changes, graph and history views. Folder browser, Ctrl+K command palette, and a source panel that highlights the referenced line with a VS Code link. It pages data from the server, so it stays responsive at 20k components.
- Graph data from a bounded `/api/graph` (focus plus depth, a folder, or the whole app), capped at 400 nodes unless forced (`17f5487`).
- Classic UI gained Design, Hooks and Changes views (`f8d439d`).
- HTTP API: `/api/components` (paged, with the query language), `/api/component`, `/api/pages`, `/api/diff`, `/api/info`, `/api/section`, `/api/issues`, `/api/folders`, `/api/graph`. Errors are JSON with status codes.

**Dev-server integrations**

- Vite: the plugin serves the catalogue UI and API on the dev server at `/__frontdex/` (`78ab485`). It applies to `serve` only, so nothing reaches `vite build`.
- webpack and Rspack: `frontdex/webpack` (same module as `frontdex/rspack`) starts the watcher in watch mode only; no loader, nothing in production builds (`78ab485`).
- Component overlay for React, development only (`54b8681`): hold Alt and hover an element to see the component's name, `file:line` and props; Alt+click opens it in the catalogue UI. Vite injects it with `frontdex({ overlay: true })`; elsewhere, `import('frontdex/overlay')` behind a `NODE_ENV === 'development'` check. Needs a development build of React.
- Live component preview, Vite + React (`cba50c9`): `/__frontdex/preview?id=<component id>` renders one component through your dev server (its imports, CSS and HMR) inside an error boundary. Component pages in the UI show it with a JSON props editor seeded from story args. The `previewWrapper` config option wraps previews in your app's providers.

### Performance

Measured with `node bench/scan.js 250`: the Next sample copied 250 times, 22,500 files and 19,500 components, Node 24 on a 4-core Windows laptop.

| Operation | 0.3.0 |
|---|---|
| Cold scan | 80–100 s (was a crash at this size, see Changed) |
| No-change rescan (CLI) | 11–13 s (20 s before `534c859`) |
| Save while `watch` / `serve -w` runs | ~130 ms (3.2 s before `6983eb2`) |
| Project-wide findings after a save | settle ~2.8 s after edits pause |
| Peak RSS | 1.8–2.6 GB uncapped; completes with `--max-old-space-size=1024`, more slowly |

What changed to get there:

- Watch mode patches a save into the in-memory catalogue, re-parsing only the changed files and re-linking only their components (`6983eb2`). Project-wide fields are recomputed by a full scan 1.5 s after the last edit; that scan writes YAML, agent cards and history. While it runs, `/api/info` reports settling and the UI shows "analysing…". Renames, route changes and added or removed files still trigger a full scan.
- Watch sessions keep the parse cache, file list and catalogue in memory, skip the directory walk, and write YAML and the parse cache once edits pause (`67c631e`, `3dee710`, `cf01556`, `f6612b9`). `serve -w` and `watch` no longer scan twice at start, and neither does the Vite plugin (`5845ce3`).
- Large batches parse on worker threads (`7e172b7`) that stream results in chunks of 25, so a worker no longer runs out of heap and stalls the scan (`534c859`). Workers are capped at half the logical CPUs minus one, minimum 2, with bounded heaps (`6c04179`). Files are read and hashed inside the workers (`6641a6c`).
- One directory walk instead of two, cached stylesheet parses, and the parse cache rewritten only when it changed (`a7d2584`). Module resolution is cached per tsconfig and per target path (`534c859`).

### Fixed

- Agent cards were not regenerated when only the card format changed, so agents kept reading stale cards (`001ca89`).
- The `/v2` path containment check rejected every file because of a trailing separator (`cd674ec`).
- Module resolution is case-exact on case-insensitive file systems (`92f80a4`).
- A third declaration of the same route no longer overwrites the second (`92f80a4`).
- Folder events and editor temp files no longer force a full rescan in watch mode (`6983eb2`).
- The scanner cache hash covers scanner subfolders, so adapter changes invalidate cached parses (`fb015c1`).
- The types test ignores CRLF line endings on Windows checkouts (`efaca97`).

### Security

- **Git refs** (`ce0c398`): `frontdex diff` and `/api/diff` reject refs that start with `-` or are too long, resolve the ref with `git rev-parse --verify --end-of-options` first, and pass only the resolved commit SHA to `git show` and `git worktree add`. Before this, an option-like ref could reach git as a flag.
- **Localhost only** (`ce0c398`, `78ab485`, `54b8681`): `/api/*` answers only requests with a localhost `Host` header, which blocks DNS rebinding from a browser. `data.js` (the whole catalogue) has the same restriction. The API and `data.js` also require a loopback socket peer, so `vite --host` does not expose your source to the LAN; the Vite plugin's `allowLan: true` opts out. CORS headers are sent only to localhost origins.
- **Shard paths** (`9755dad`): the shard index can come from disk or from a git commit and may be tampered with. Only `components/<name>.yaml` entries become file paths, so an entry like `../keep.txt` can no longer be read or deleted.
- **Preview props** (`22ee4f2`): the preview page took initial props from `?props=` in its URL, so a crafted link to localhost could pass `dangerouslySetInnerHTML` and run script on the dev server's origin, which also serves the API. Props now arrive only by `postMessage` from a parent window on the same origin.

### Removed or dropped

- **Built-in MCP server** removed from this package; it is now `frontdex-mcp` (`f4a2183`).
- **oxc parser port** dropped (`d312b65`). Parsing is 7% of a scan, and the port would have rewritten ~1,900 lines that depend on Babel scope analysis for a single-digit gain. Babel stays.
- **SQLite + FTS5 index** rejected after measuring (`9755dad`). On 15.6k components SQLite queries were 3–15× slower than the in-memory index (`uses:Button` 95 ms vs 6 ms; opening it 188 ms vs 0.14 ms), because callers still load the catalogue and the matcher still runs.
- **TypeScript workspace conversion** dropped (`78ab485`): a rewrite of a working, tested JS codebase with no user-facing gain. Published `.d.ts` types ship instead.
- **CatalogueSpec 2.0** not introduced; the spec stays at 1.1 (`09753e5`). From the first published release, 1.x changes are additive and breaking changes go to 2.0.
- **Next.js component preview and `frontdex screenshot`** cut (`cba50c9`). A component route in Next would be compiled by `next build`, and screenshots need a headless browser dependency. Agents can screenshot the Vite preview URL with their own browser tools. Next keeps the page-level Preview tab.
- **Overlay render counts** cut, and the overlay is React-only for now (`54b8681`).

## 0.2.0

Commit `f4e0a9b`, 2026-10-19. Package name: react-catalogue.

- Incremental scans with a content-hash cache; an auto-update watcher; Next.js and Vite plugins.
- Git-like history of knowledge-base snapshots with field-level diffs.
- Deep component analysis: variables, functions, timers and listeners (with leak detection), render loops, unsafe async updates, stale dependencies, API calls, Redux/context/zustand reads and writes, validation (zod, yup, react-hook-form, HTML), CSS class to `file:line`, props per render site, and dead code (unused components, files, exports, imports, variables, props).
- CatalogueSpec 1.1 (stores, styles, health) with its JSON Schema.
- Agent layer: knowledge base for agents, an MCP server with dataflow, health, state, api and styles tools, and rules plus hooks for Claude Code, Cursor, OpenCode and Hermes.
- Page-first UI: site map, page structure and preview, component data flow, family, internals, lifecycle, global state, health and rescan.
- Larger Next.js and React Router sample apps.

## 0.1.0

Commit `6418c78`, 2026-10-19. Package name: react-catalogue.

- CatalogueSpec 1.0: a YAML format and JSON Schema for components, props, state, hooks, lifecycle and pages.
- Babel-based scanner for React and Next.js: function, class, `memo` and `forwardRef` components; Next App and Pages routers; React Router; tsconfig aliases, barrel files and lazy imports.
- `rcat` CLI: `init`, `generate`, `validate`, `serve` (with watch and live reload) and `build`.
- A dependency-free catalogue UI with a dependency graph, lifecycle matrix and page composition trees.
- Sample Next.js and React Router apps.
