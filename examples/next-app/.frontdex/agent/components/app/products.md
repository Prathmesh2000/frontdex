# app/products

1 component(s). Index: `.frontdex/agent/INDEX.md`

## ProductsPage
`app/products/page.tsx:7` · function · server component · default export · trivial

Catalogue listing with sidebar filters. Filters and grid are siblings.

- Props: `searchParams: Promise<{ category?: string; sort?: 'price' | 'rating' | 'newest' }>`
- Variables: category, sort
- CSS classes: flex, gap-8
- Renders: Filters(categories), ProductGrid(category, sort)
- Used by: nothing (unused or entry point)
- Pages: /products
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
