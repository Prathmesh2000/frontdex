# src/features/toast

3 component(s). Index: `.frontdex/agent/INDEX.md`

## ToastItem
`src/features/toast/ToastViewport.tsx:6` · function · client component · none export · simple

- Props: `toast: Toast`, `onDismiss: (id: number) => void`
- Hooks: useEffect
- Effect `useEffect` L8: mount+update+unmount (deps [toast.id, onDismiss]) → setTimeout, onDismiss; cleanup → clearTimeout
- Props from ToastViewport: key=t.id, toast=t, onDismiss=dismiss
- Timer `setTimeout` in useEffect L8 (line 9): released
- CSS classes: toast (app/globals.css:36), toast-
- Renders: Badge(tone)
- Used by: ToastViewport
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 2 component(s) and 13 page(s); update every caller listed under "Used by".

## ToastProvider
`src/features/toast/ToastContext.tsx:19` · function · client component · named export · simple

Global notification queue (max 5 visible).

- Props: `children: React.ReactNode`
- State: `toasts` (useReducer, init `[]`, set via `dispatch`)
- Hooks: useReducer, useCallback×2
- Function `notify(message: string, tone: Toast['tone'] = 'info')` L21 sets toasts → dispatch, Date.now
- Function `dismiss(id: number)` L22 sets toasts → dispatch
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".

## ToastViewport
`src/features/toast/ToastViewport.tsx:23` · function · client component · named export · trivial

Renders queued toasts in the corner of the screen.

- Hooks: useToast
- Reads context:ToastContext via useToast
- CSS classes: toast-viewport, fixed, bottom-4, right-4, z-50
- Renders: ToastItem(key, toast, onDismiss)
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".
