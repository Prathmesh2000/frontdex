# src/features/cart

3 component(s). Index: `.frontdex/agent/INDEX.md`

## CartDrawer
`src/features/cart/CartDrawer.tsx:10` · function · named export · simple

Slide-over cart opened from the header. Visibility lives in Redux (ui.drawerOpen).

- Hooks: useAppSelector×3, useAppDispatch, useRouter
- Function `close()` L17 → dispatch, toggleDrawer
- Function `goToCheckout()` L18 → close
- Reads redux:ui `ui.drawerOpen` via useAppSelector
- Reads redux:cart `cart.items` via useAppSelector
- Reads redux:cart `cart.coupon` via useAppSelector
- Writes redux:ui: `toggleDrawer` via dispatch in handler close
- CSS classes: empty
- Renders: Modal(open, title, onClose, footer), Button(onClick, disabled), CartItem(key, line), OrderSummary(lines, coupon, readOnly)
- Used by: Header
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 2 component(s) and 13 page(s); update every caller listed under "Used by".

## CartItem
`src/features/cart/CartItem.tsx:10` · memo · named export · simple

One cart line with quantity stepper and remove button.

- Props: `line: CartLine`, `readOnly?: boolean` = `false`
- Hooks: useAppDispatch
- Props from CartPage: key=line.product.id, line=line
- Props from OrderTimeline: key=l.product.id, line=l, readOnly=true
- Props from CartDrawer: key=line.product.id, line=line
- Props from CheckoutWizard: key=l.product.id, line=l, readOnly=true
- Variables: subtotal
- Handler `onStep(delta: number)` L13 → dispatch, updateQuantity
- Writes redux:cart: `updateQuantity` via dispatch in handler onStep
- Writes redux:cart: `removeItem` via dispatch in inline callback
- CSS classes: cart-item, flex, items-center, gap-3, stepper
- Renders: Button(variant, size, onClick)
- Libraries: next/image#Image
- Used by: CartPage, OrderTimeline, CartDrawer, CheckoutWizard
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 8 component(s) and 13 page(s); update every caller listed under "Used by".

## OrderSummary
`src/features/cart/OrderSummary.tsx:21` · memo · named export · moderate

Totals, shipping and coupon entry.

- Props: `lines: CartLine[]`, `coupon: string | null`, `readOnly?: boolean` = `false`
- State: `code` (useState, init `''`, set via `setCode`); `codeError` (useState, init `null`, set via `setCodeError`)
- Hooks: useAppDispatch, useState×2, useMemo
- Props from CartPage: lines=items, coupon=coupon
- Props from CartDrawer: lines=items, coupon=coupon, readOnly=true
- Props from CheckoutWizard: lines=items, coupon=coupon, readOnly=state.step === 2
- Variables: subtotal, discount, shipping, total
- Handler `handleApply()` L31 sets codeError → .toUpperCase, code.trim, COUPON_RE.test, setCodeError, dispatch, applyCoupon
- Writes redux:cart: `applyCoupon` via dispatch in handler handleApply
- Validation (html): Coupon [pattern]
- CSS classes: text-green-600, text-xl, font-bold, flex, gap-2
- Renders: Card, CardHeader(title), CardBody, Input(label, value, pattern, error, onChange), Button(variant, onClick)
- Used by: CartPage, CartDrawer, CheckoutWizard
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 6 component(s) and 13 page(s); update every caller listed under "Used by".
