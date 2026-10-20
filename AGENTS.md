# AGENTS.md: working on the frontdex repo

frontdex statically scans React, Next.js, Vue, Svelte, Astro, Angular, Web Components and HTML projects into a catalogue (`frontdex.yaml`), an agent knowledge base (`.frontdex/agent/`), a UI, a CLI and the data behind an MCP server (the server itself is the separate repo `Prathmesh2000/frontdex-mcp`).

This file is for agents changing frontdex itself. To set frontdex up in an app, see [docs/AGENTS.md](docs/AGENTS.md).

## Commands

```bash
npm ci                     # install
npm test                   # all tests (node:test); must pass
npm run typecheck:ui       # when ui-react/ changed
npm run gen:types          # after editing spec/catalogue.schema.json
node bin/frontdex.js scan -C examples/next-app    # regenerate a golden example after an intended output change
node bin/frontdex.js serve -C examples/next-app   # see the result at http://localhost:4400
```

## Map

Full map and flows: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Path | What |
|---|---|
| `src/scanner/parse-file.js`, `component.js` | Per-file Babel parse: components, props, state, JSX, routes |
| `src/scanner/adapters/` | `.vue`, `.svelte`, `.astro`, `.html` |
| `src/scanner/graph.js` | Linking: ids, renders/usedBy, pages, navigation; watch fast patch |
| `src/scanner/routers.js`, `paths.js` | File-system routers; route path expressions |
| `src/scanner/insights.js`, `project.js`, `analyzers/` | Diagnostics and cross-file insights |
| `src/index.js` (+ `index.d.ts`) | Public API; `scan()` is the only writer of outputs |
| `src/tools.js` | Query tools shared by CLI and MCP |
| `src/agents.js` | `frontdex agents`: per-agent rules, MCP registration, hooks |
| `src/server.js`, `ui-react/src/` | HTTP API (localhost-only) and React UI |
| `spec/catalogue.schema.json` | Source of truth for the catalogue shape |

## Conventions

- ESM JavaScript in `src/`; TypeScript only in `.d.ts` files and `ui-react/`.
- Do not add runtime dependencies. Framework compilers load from the scanned project (`loadFromProject`).
- A parse result depends only on its own file; cross-file work belongs in linking (`graph.js`) or `project.js`.
- New fields computed after linking go in `CARRIED` in `graph.js`, or the watch fast patch drops them.
- Public API changes: update `src/index.js` and `src/index.d.ts` together.
- Comments: a purpose line on non-trivial functions and why-comments for non-obvious decisions. No comments that restate code.
- Match the surrounding style; keep diffs small.

## Common tasks

- **Router or framework**: `routers.js` (file-system) or `parse-file.js` + `graph.js` (routes in code); test in `test/routers.test.js`.
- **Diagnostic**: `insights.js` (per component) or `project.js` (cross-file); document the issue type in `docs/SPEC.md`.
- **MCP tool**: add to `tools` in `src/tools.js`, then to `TOOLS` in frontdex-mcp `src/server.js` and its tool-count test; mention it in `rulesFor()` if agents should use it by default.
- **Agent target**: `TARGETS` and a `want('<name>')` block in `src/agents.js`; test in `test/knowledge.test.js`.

## Do not touch

- `examples/*`: test inputs and golden outputs. Changing them changes what `test/golden.test.js` expects.
- `ui-react/dist/`, `dist-pack/`, `.frontdex/`: generated.
- `LICENSE`, `NOTICE`: legal text.

## Done means

- [ ] `npm test` passes (and `npm run typecheck:ui` if `ui-react/` changed)
- [ ] Tests added or updated for behaviour changes
- [ ] Golden examples regenerated and reviewed if output changed on purpose
- [ ] `CHANGELOG.md` entry under `## Unreleased` for user-visible changes
- [ ] README or `docs/` updated if a command, option or output changed
