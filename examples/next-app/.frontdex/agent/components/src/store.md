# src/store

1 component(s). Index: `.frontdex/agent/INDEX.md`

## StoreProvider
`src/store/StoreProvider.tsx:7` · function · client component · named export · trivial

Creates the Redux store once per request/tab and provides it to client components.

- Props: `children: React.ReactNode`
- Refs: `storeRef`
- Hooks: useRef
- Libraries: react-redux#Provider
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".
