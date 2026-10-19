# app

2 component(s). Index: `.catalogue/agent/INDEX.md`

## HomePage
`app/page.tsx:5` · function · default export · trivial

Landing page: promo hero + tabbed collections.

- Renders: HeroBanner(headline, endsAt), FeaturedCollections(defaultTab)
- Used by: nothing (unused or entry point)
- Pages: /
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".

## RootLayout
`app/layout.tsx:19` · function · default export · simple

App shell: Redux store, auth, theme and toasts wrap every page.

- Props: `children: React.ReactNode`
- CSS classes: container, mx-auto, px-4
- Renders: StoreProvider, AuthProvider, ThemeProvider, ToastProvider, Header, Footer(links, year), ToastViewport
- Used by: nothing (unused or entry point)
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 0 component(s) and 13 page(s); update every caller listed under "Used by".
