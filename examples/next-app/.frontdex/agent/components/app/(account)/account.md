# app/(account)/account

2 component(s). Index: `.frontdex/agent/INDEX.md`

## AccountLayout
`app/(account)/account/layout.tsx:5` · function · server component · default export · trivial

Signed-in area wrapper.

- Props: `children: React.ReactNode`
- CSS classes: account-body
- Renders: ProtectedRoute, AccountNav
- Used by: nothing (unused or entry point)
- Pages: /account/orders/[orderId], /account
- Impact: changing the props/export affects 0 component(s) and 2 page(s); update every caller listed under "Used by".

## AccountPage
`app/(account)/account/page.tsx:7` · function · client component · default export · trivial

- Hooks: useAuth, useSearchParams
- Variables: wantsLogin
- Reads context:AuthContext via useAuth
- Renders: ProfileForm, LoginForm(onSuccess)
- Used by: nothing (unused or entry point)
- Pages: /account
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
