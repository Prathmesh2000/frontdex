# Contributing to frontdex

Bug reports, detection gaps ("frontdex misses this pattern"), fixes and new framework support are all welcome. Using a coding agent? Point it at [AGENTS.md](AGENTS.md); it holds the same rules in a shorter form.

## Setup

Node 20 or later for development (the published package runs on 18.17+).

```bash
git clone https://github.com/Prathmesh2000/frontdex.git
cd frontdex
npm ci
npm test                                          # node:test, all suites
node bin/frontdex.js serve -C examples/next-app -w   # try your change on a sample, UI at :4400
```

| Command | When |
|---|---|
| `npm test` | Always, before pushing |
| `npm run typecheck:ui` | You changed `ui-react/` |
| `npm run dev:ui` | Working on the React UI (proxies `/api` to a running `frontdex serve`) |
| `npm run build:ui` | To check the production UI build (`prepack` runs it on publish) |
| `npm run gen:types` | You changed `spec/catalogue.schema.json` (regenerates `spec/catalogue.d.ts`; `test/types.test.js` fails when it is stale) |

## How the code is organised

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the pipeline, a module map and step-by-step notes for the common changes: a router or framework, a diagnostic, an MCP tool, an agent target.

## Tests

- Tests live in `test/*.test.js` and use `node:test`. Most write a small throwaway project to a temp dir, scan it and assert on the catalogue. Copy the pattern of the nearest test (`routers.test.js`, `adapters.test.js`, `mapping.test.js`).
- **Golden files**: the committed `frontdex.yaml` and `.frontdex/agent/` of each project in `examples/` are expected output (`test/golden.test.js`). If your change alters them on purpose, regenerate and review the diff like code:

  ```bash
  node bin/frontdex.js scan -C examples/next-app   # same for react-app and monorepo
  ```

- Changing a file under `examples/` changes those expectations too. Add a new fixture in the test instead when you can.

## Pull requests

1. Open an issue first for large changes, so the approach can be agreed before you write it.
2. Keep a PR to one change. Add or update tests for any behaviour change.
3. Add a line to `CHANGELOG.md` under `## Unreleased` (create the heading if it is missing) for anything a user would notice.
4. Update the README or `docs/` when you change a command, option or output.
5. A new MCP tool also needs its schema in [frontdex-mcp](https://github.com/Prathmesh2000/frontdex-mcp) (`TOOLS` in `src/server.js`).

CI runs the tests on Node 20, 22 and 24 (Linux) and Node 22 (Windows), plus the UI typecheck and a pack dry run. `main` is protected: a PR merges once all four test jobs pass and a maintainer approves it.

## Releases

Maintainers release from GitHub: **Actions → Release → Run workflow** on `main`, choosing patch, minor or major. The workflow tests, bumps the version, dates the `Unreleased` CHANGELOG section, publishes to npm with provenance (npm Trusted Publishing, no token), tags the commit and creates the GitHub Release.

## License

frontdex is licensed under [Apache-2.0](LICENSE). By opening a pull request you agree that your contribution is licensed under the same terms (section 5 of the license). There is no CLA.

## Conduct and security

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md), not in public issues.
