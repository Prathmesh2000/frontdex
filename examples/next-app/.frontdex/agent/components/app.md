# app

2 component(s). Index: `.frontdex/agent/INDEX.md`

## HomePage
`app/page.tsx:8` · function · server component · default export · trivial

Landing page: promo hero + tabbed collections.

- Owners: @northwind/web
- Renders: HeroBanner(headline, endsAt), FeaturedCollections(defaultTab), NewsletterForm
- Used by: nothing (unused or entry point)
- Pages: /
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".

## RootLayout
`app/layout.tsx:19` · function · server component · default export · simple

App shell: Redux store, auth, theme and toasts wrap every page.

- Owners: @northwind/web
- Props: `children: React.ReactNode`
- CSS classes: container, mx-auto, px-4
- Renders: StoreProvider, AuthProvider, ThemeProvider, ToastProvider, Header, Footer(links, year), ToastViewport
- Used by: nothing (unused or entry point)
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 0 component(s) and 13 page(s); update every caller listed under "Used by".
