# src/components

6 component(s). Index: `.frontdex/agent/INDEX.md`

## ErrorBoundary
`src/components/ErrorBoundary.jsx:4` · class · default export · moderate

Keeps a crashing page from taking down the shell.

- Props: `children?: unknown`
- State: `error` (class, init `null`, set via `this.setState`)
- Effect `getDerivedStateFromError` L7: error
- Effect `componentDidCatch` L11: error → navigator.sendBeacon, JSON.stringify
- CSS classes: error-screen (src/styles.css:9)
- Used by: AppShell
- Pages: /, /users, /users/:userId, /users/:userId/edit, /settings, /settings/profile, /settings/billing, /settings/security
- Impact: changing the props/export affects 1 component(s) and 8 page(s); update every caller listed under "Used by".

## ErrorScreen
`src/components/ErrorScreen.jsx:4` · function · default export · trivial

Router-level errorElement (404s, loader failures).

- Hooks: useRouteError
- CSS classes: error-screen (src/styles.css:9)
- Libraries: react-router-dom#Link
- Used by: nothing (unused or entry point)
- Pages: /, /users, /users/:userId, /users/:userId/edit, /settings, /settings/profile, /settings/billing, /settings/security
- Impact: changing the props/export affects 0 component(s) and 8 page(s); update every caller listed under "Used by".

## LegacyStats
`src/components/LegacyStats.jsx:5` · function · default export · trivial · DEPRECATED

Old dashboard widget.

- Props: `stats?: unknown` = `[]`
- CSS classes: legacy-stats
- Used by: nothing (unused or entry point)

## AppShell
`src/components/AppShell.jsx:6` · function · default export · trivial

Layout route: sidebar navigation + routed content.

- CSS classes: shell (src/styles.css:1), nav (src/styles.css:2)
- Renders: SelectionBar, ErrorBoundary
- Libraries: react-router-dom#NavLink, react-router-dom#Outlet
- Used by: nothing (unused or entry point)
- Pages: /, /users, /users/:userId, /users/:userId/edit, /settings, /settings/profile, /settings/billing, /settings/security
- Impact: changing the props/export affects 0 component(s) and 8 page(s); update every caller listed under "Used by".

## SelectionBar
`src/components/SelectionBar.jsx:6` · class · default export · trivial

Bulk-action bar shown when users are selected. Legacy connect() wiring.

- Props: `selectedCount?: unknown`, `onClear?: unknown`
- Reads redux:users `users.selectedIds` via connect
- Writes redux:users: `clearSelection` via connect
- CSS classes: selection-bar
- Used by: AppShell
- Pages: /, /users, /users/:userId, /users/:userId/edit, /settings, /settings/profile, /settings/billing, /settings/security
- Impact: changing the props/export affects 1 component(s) and 8 page(s); update every caller listed under "Used by".

## MetricTicker
`src/components/MetricTicker.jsx:8` · class · default export · heavy

Polls the metrics endpoint and animates value changes.
Class component exercising every lifecycle method.

- Props: `intervalMs?: unknown` = `10000`, `label?: unknown` = `'Active users'`
- State: `value` (class, init `0`, set via `this.setState`); `previous` (class, init `0`, set via `this.setState`); `history` (class, init `[]`, set via `this.setState`); `lastInterval` (class, init `props.intervalMs`, set via `this.setState`)
- Refs: `listRef`
- Effect `constructor` L11: mount → React.createRef
- Effect `getDerivedStateFromProps` L17: mount+update
- Effect `componentDidMount` L21: mount → this.load, setInterval
- Effect `shouldComponentUpdate` L26: update
- Effect `getSnapshotBeforeUpdate` L30: update
- Effect `componentDidUpdate` L35: update → clearInterval, setInterval, this.load
- Effect `componentWillUnmount` L43: unmount → clearInterval
- Props from Dashboard: label="Active users", intervalMs=5000, label="Signups today", intervalMs=30000
- Function `async load()` L47 → fetchMetrics, this.setState
- Timer `setInterval` in componentDidMount (line 23): released
- Timer `setInterval` in componentDidUpdate (line 39): released
- API CALL `fetchMetrics()` via service in load (line 48)
- CSS classes: ticker, up, down
- Used by: Dashboard
- Pages: /
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".
