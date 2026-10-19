# app/checkout

2 component(s). Index: `.frontdex/agent/INDEX.md`

## CheckoutLayout
`app/checkout/layout.tsx:4` · function · server component · default export · trivial

Distraction-free checkout chrome.

- Owners: @northwind/web
- Props: `children: React.ReactNode`
- CSS classes: checkout-shell, max-w-5xl, mx-auto, text-xs, text-gray-500
- Libraries: next/link#Link
- Used by: nothing (unused or entry point)
- Pages: /checkout, /checkout/success
- Impact: changing the props/export affects 0 component(s) and 2 page(s); update every caller listed under "Used by".

## CheckoutPage
`app/checkout/page.tsx:6` · function · client component · default export · trivial

- Owners: @northwind/web
- Hooks: useAuth
- Reads context:AuthContext via useAuth
- Renders: ProtectedRoute, CheckoutWizard(userEmail)
- Used by: nothing (unused or entry point)
- Pages: /checkout
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
