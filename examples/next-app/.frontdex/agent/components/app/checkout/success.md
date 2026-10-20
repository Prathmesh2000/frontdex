# app/checkout/success

1 component(s). Index: `.frontdex/agent/INDEX.md`

## SuccessPage
`app/checkout/success/page.tsx:7` · function · client component · default export · simple

- Owners: @northwind/web
- Hooks: useSearchParams, useEffect
- Effect `useEffect` L9: mount+update (deps [orderId]) → trackEvent
- Variables: orderId
- API CALL `trackEvent()` via service in useEffect L9 (line 10)
- CSS classes: text-center, py-20
- Navigates to: `/account/orders/[orderId]`
- Libraries: next/link#Link
- Used by: nothing (unused or entry point)
- Pages: /checkout/success
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
