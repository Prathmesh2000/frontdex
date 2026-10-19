# src/features/search

2 component(s). Index: `.frontdex/agent/INDEX.md`

## SearchResults
`src/features/search/SearchResults.tsx:9` · function · client component · named export · simple

Results list for a search term; re-fetches as the term changes.

- Props: `term: string`, `limit?: number` = `30`
- Hooks: useSWR
- Props from SearchPage: term=term
- Variables: count
- API GET `term ? '/api/search?q=${encodeURIComponent(term)}&limit=${limit}' : null` via useSWR in render (line 10)
- CSS classes: hint, grid (app/globals.css:6)
- Renders: Spinner(label), ProductCard(key, product, compact)
- Used by: SearchPage
- Pages: /search
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## SearchBar
`src/features/search/SearchBar.tsx:16` · function · client component · named export · complex

Debounced search input with recent-term suggestions.

- Props: `placeholder?: string` = `'Search'`, `onSearch?: (term: string) => void`, `autoFocus?: boolean` = `false`
- State: `term` (useState, init `''`, set via `setTerm`); `open` (useState, init `false`, set via `setOpen`)
- Refs: `inputRef`
- Hooks: useState×2, useDebounce, useSearchStore×2, useRef, useRouter, useEffect×2
- Effect `useEffect` L25: mount+update (deps [autoFocus])
- Effect `useEffect` L29: mount+update (deps [debounced, onSearch])
- Props from SearchPage: placeholder="What are you looking for?", onSearch=setTerm, autoFocus=true
- Props from Header: placeholder="Search products"
- Handler `handleSubmit(e: React.FormEvent)` L33 → e.preventDefault, term.trim, addRecent, trackEvent, onSearch, encodeURIComponent
- Timer `setTimeout` in inline callback (line 44): one-shot
- API CALL `trackEvent()` via service in handler handleSubmit (line 37)
- Reads zustand:useSearchStore `recent` via useSearchStore
- Reads zustand:useSearchStore `addRecent` via useSearchStore
- Validation (html): input [required, minLength]
- CSS classes: search-bar, relative, suggestions, absolute
- Used by: SearchPage, Header
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 3 component(s) and 13 page(s); update every caller listed under "Used by".
