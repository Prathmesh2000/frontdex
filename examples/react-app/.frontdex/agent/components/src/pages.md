# src/pages

1 component(s). Index: `.frontdex/agent/INDEX.md`

## Dashboard
`src/pages/Dashboard.jsx:5` · function · default export · simple

Landing page with live metrics.

- State: `width` (useState, init `window.innerWidth`, set via `setWidth`)
- Hooks: useState, useEffect
- Effect `useEffect` L8: mount (once) → window.addEventListener, setWidth
- Timer `window.addEventListener`('resize') in useEffect L8 (line 10): NOT RELEASED
- CSS classes: dashboard, stacked
- ⚠ HIGH memory-leak L10: window.addEventListener('resize') started in useEffect L8 without cleanup. Fix: return () => target.removeEventListener(sameEvent, sameHandler) from the effect
- Renders: MetricTicker(label, intervalMs, label, intervalMs)
- Used by: nothing (unused or entry point)
- Pages: /
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
