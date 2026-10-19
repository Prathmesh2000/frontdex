# app/search

1 component(s). Index: `.catalogue/agent/INDEX.md`

## SearchPage
`app/search/page.tsx:8` · function · default export · simple

Live search: SearchBar reports debounced terms, SearchResults fetches them.

- State: `term` (useState, init `initial`, set via `setTerm`)
- Hooks: useSearchParams, useState
- Variables: initial
- Renders: SearchBar(placeholder, onSearch, autoFocus), SearchResults(term)
- Used by: nothing (unused or entry point)
- Pages: /search
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
