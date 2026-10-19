# src/features/account

3 component(s). Index: `.catalogue/agent/INDEX.md`

## ProfileForm
`src/features/account/ProfileForm.tsx:10` · function · named export · complex

Edit name/email with native HTML validation.

- State: `name` (useState, init `profile?.name ?? ''`, set via `setName`); `email` (useState, init `profile?.email ?? ''`, set via `setEmail`); `lastSaved` (useState, init `null`, set via `setLastSaved`); `saving` (useState, init `false`, set via `setSaving`)
- Hooks: useSelector, useState×4, useToast, useAppSelector
- Handler `async handleSubmit(e: React.FormEvent<HTMLFormEl…)` L20 sets saving → e.preventDefault, setSaving, http.patch, notify
- API PATCH `/me` via http.patch in handler handleSubmit L24
- Reads redux:user `user.profile` via useSelector
- Reads redux:user `user.wishlist` via useAppSelector
- Reads context:ToastContext via useToast
- Validation (html): Name [required, minLength, maxLength]
- Validation (html): Email [required, type=email]
- CSS classes: hint
- ⚠ INFO state-never-updated L15: `setLastSaved` is never called, so this state never changes. Fix: replace the state with a constant
- ⚠ LOW unused-variable L18: `wishlistCount` (from useAppSelector) is never used
- Renders: Input(label, required, minLength, maxLength, value, onChange, label, type, required, value, onChange), Button(type, loading)
- Used by: AccountPage
- Pages: /account
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## OrderTimeline
`src/features/account/OrderTimeline.tsx:12` · function · named export · moderate

Order status with live polling until the order ships.

- Props: `orderId: string`
- State: `order` (useState, init `null`, set via `setOrder`)
- Hooks: useState, useEffect
- Effect `useEffect` L15: mount+update+unmount (deps [orderId]) → fetch, load, setInterval; cleanup → clearInterval, controller.abort
- Props from OrderDetailPage: orderId=orderId
- Timer `setInterval` in useEffect L15 L23: released
- API GET `/api/orders/${orderId}` via fetch in useEffect L15 L18
- Renders: Spinner(label), Card, CardHeader(title, action), Badge(tone), CardBody, CartItem(key, line, readOnly)
- Used by: OrderDetailPage
- Pages: /account/orders/[orderId]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## AccountNav
`src/features/account/AccountNav.tsx:13` · function · named export · trivial

Account section tabs; highlights the active route.

- Hooks: usePathname
- CSS classes: account-nav, flex, gap-4, tab, tab-active, underline
- Libraries: next/link#Link
- Used by: AccountLayout
- Pages: /account/orders/[orderId], /account
- Impact: changing the props/export affects 1 component(s) and 2 page(s); update every caller listed under "Used by".
