# src/components/ui

14 component(s). Index: `.frontdex/agent/INDEX.md`

## CardHeader
`src/components/ui/Card.tsx:1` · function · client component · none export · trivial

- Owners: @northwind/design-system
- Props: `title: string`, `action?: React.ReactNode`
- Props from OrderTimeline: title=`Order ${order.id}`, action=<Badge tone={TONE[order.status]}>{order.status}</…
- Props from OrderEditor: title=formatPrice(order.total), action=<Badge>{order.status}</Badge>
- Props from StatCard: title=title
- Props from OrderSummary: title="Order summary"
- CSS classes: card-header (app/globals.css:19)
- Used by: OrderTimeline, OrderEditor, StatCard, OrderSummary
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 13 component(s) and 13 page(s); update every caller listed under "Used by".

## Spinner
`src/components/ui/Spinner.tsx:2` · function · client component · named export · trivial

Inline loading indicator.

- Owners: @northwind/design-system
- Props: `size?: number` = `16`, `label?: string` = `'Loading'`
- Props from Button: size=14
- Props from DataTable: label="Loading rows"
- Props from OrderTimeline: label="Loading order"
- Props from ProtectedRoute: label="Checking session"
- Props from ProductGrid: label="Loading products"
- Props from Reviews: label="Loading reviews"
- Props from SearchResults: label="Searching"
- CSS classes: spinner (app/globals.css:30)
- Used by: Button, DataTable, OrderTimeline, ProductEditor, ProtectedRoute, ProductGrid, Reviews, SearchResults
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 41 component(s) and 13 page(s); update every caller listed under "Used by".

## Badge
`src/components/ui/Badge.tsx:3` · function · client component · named export · trivial

- Owners: @northwind/design-system
- Props: `tone?: Tone` = `'neutral'`, `children: React.ReactNode`
- Props from OrderTimeline: tone=TONE[order.status]
- Props from ProductCard: tone="success", tone="warning"
- Props from ProductInfo: tone=inStock ? 'success' : 'danger'
- Props from ToastItem: tone=toast.tone === 'error' ? 'danger' : 'success'
- CSS classes: badge (app/globals.css:22), badge-
- Used by: OrderTimeline, OrderEditor, ProductCard, ProductInfo, ToastItem
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 17 component(s) and 13 page(s); update every caller listed under "Used by".

## Tooltip
`src/components/ui/Tooltip.tsx:4` · function · client component · named export · moderate

- Owners: @northwind/design-system
- Props: `text: string`, `children: React.ReactElement`
- State: `visible` (useState, init `false`, set via `setVisible`); `position` (useState, init `{ top: 0, left: 0 }`, set via `setPosition`)
- Refs: `anchorRef`
- Hooks: useState×2, useRef, useLayoutEffect
- Effect `useLayoutEffect` L10: mount+update (deps [visible]) → anchorRef.current.getBoundingClientRect, setPosition
- Props from ProductCard: text=`Only ${product.stock} left`
- Used by: ProductCard
- Pages: /, /products/[id], /products, /search
- Impact: changing the props/export affects 9 component(s) and 4 page(s); update every caller listed under "Used by".

## CardBody
`src/components/ui/Card.tsx:5` · function · client component · none export · trivial

- Owners: @northwind/design-system
- Props: `children: React.ReactNode`
- CSS classes: card-body (app/globals.css:20)
- Used by: OrderTimeline, OrderEditor, StatCard, OrderSummary
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 13 component(s) and 13 page(s); update every caller listed under "Used by".

## Card
`src/components/ui/Card.tsx:10` · function · client component · named export · trivial

Surface container. Compose with <Card.Header> and <Card.Body>.

- Owners: @northwind/design-system
- Props: `children: React.ReactNode`, `elevated?: boolean` = `false`
- Props from StatCard: elevated=true
- Props from ProductCard: elevated=!compact
- CSS classes: card (app/globals.css:17), elevated (app/globals.css:18)
- Used by: OrderTimeline, OrderEditor, StatCard, OrderSummary, ProductCard
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 22 component(s) and 13 page(s); update every caller listed under "Used by".

## Input
`src/components/ui/Input.tsx:10` · forwardRef · client component · named export · simple

- Owners: @northwind/design-system
- Props: `label: string`, `error?: string`, `hint?: string`
- Hooks: useId
- Props from ProfileForm: label="Name", required=true, minLength=2, maxLength=80, value=name, onChange=(e) => setName(e.target.value), label="Email", type="email", required=true, value=email, onChange=(e) => setEmail(e.target.value)
- Props from ProductEditor: label="Name", required=true, minLength=3, value=product.name, onChange=(e) => setProduct({ ...product, name: e.target.va…, label="Price (cents)", type="number", required=true, min=0, value=product.price, onChange=(e) => setProduct({ ...product, price: Number(e.t…, label="Stock", type="number", min=0, value=product.stock, onChange=(e) => setProduct({ ...product, stock: Number(e.t…
- Props from LoginForm: label="Email", type="email", error=errors.email?.message, ...register('email', { required:…=spread, label="Password", type="password", error=errors.password?.message, ...register('password', { requir…=spread
- Props from OrderSummary: label="Coupon", value=code, pattern="[A-Za-z0-9]{4,12}", error=codeError ?? undefined, onChange=(e) => setCode(e.target.value)
- Props from AddressForm: label="Full name", required=true, minLength=2, value=values.name ?? '', error=errors.name, onChange=update('name'), label="Street", required=true, value=values.street ?? '', error=errors.street, onChange=update('street'), label="City", required=true, value=values.city ?? '', error=errors.city, onChange=update('city'), label="ZIP", required=true, pattern="\\d{5}", inputMode="numeric", value=values.zip ?? '', error=errors.zip, onChange=update('zip'), label="Country", required=true, value=values.country ?? 'US', error=errors.country, onChange=update('country')
- Props from PaymentForm: label="Card number", required=true, inputMode="numeric", autoComplete="cc-number", value=card, onChange=(e) => this.setState({ card: e.target.value }), label="Expiry (MM/YY)", required=true, pattern="(0[1-9]|1[0-2])/\\d{2}", value=expiry, onChange=(e) => this.setState({ expiry: e.target.value })
- Props from AddToCartButton: label="Qty", type="number", min=1, max=maxQuantity, required=true, value=quantity, onChange=(e) => setQuantity(Number(e.target.value))
- Props from Filters: label="Min price", type="number", min=0, value=filters.minPrice, onChange=(e) => dispatch({ type: 'set', field: 'minPrice',…, label="Max price", type="number", min=0, value=filters.maxPrice, onChange=(e) => dispatch({ type: 'set', field: 'maxPrice',…
- CSS classes: field (app/globals.css:33), error (app/globals.css:34)
- Used by: ProfileForm, ProductEditor, LoginForm, OrderSummary, AddressForm, PaymentForm, AddToCartButton, Filters
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 20 component(s) and 13 page(s); update every caller listed under "Used by".

## TabsRoot
`src/components/ui/Tabs.tsx:11` · function · client component · named export · simple

- Owners: @northwind/design-system
- Props: `defaultValue: string`, `children: React.ReactNode`
- State: `active` (useState, init `defaultValue`, set via `setActive`)
- Hooks: useState
- Props from FeaturedCollections: defaultValue=defaultTab
- CSS classes: tabs
- Used by: FeaturedCollections
- Pages: /
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## Button
`src/components/ui/Button.tsx:14` · forwardRef · client component · named export · simple

Design-system button. Use instead of raw <button> everywhere.

- Owners: @northwind/design-system
- Tests: Button.test.tsx · Stories: Button.stories.tsx
- Examples: Primary(variant="primary", children="Save")
- Props: `variant?: 'primary' | 'secondary' | 'ghost' | 'danger'` = `'primary'`, `size?: 'sm' | 'md' | 'lg'` = `'md'`, `loading?: boolean` = `false`, `icon?: React.ReactNode`, `children?: unknown`, `disabled?: unknown`
- Props from CartPage: variant="ghost", onClick=() => dispatch(clearCart())
- Props from Header: variant="ghost", size="sm", onClick=toggleTheme, aria-label="Toggle theme", variant="ghost", size="sm", onClick=signOut, variant="secondary", size="sm", onClick=onToggleCart, icon=<CartBadge />
- Props from HeroBanner: size="lg", onClick=() => window.location.assign(ctaHref)
- Props from Modal: variant="ghost", onClick=onClose
- Props from ProfileForm: type="submit", loading=saving
- Props from ErrorBoundary: onClick=() => this.setState({ error: null })
- Props from OrderEditor: variant="danger", onClick=handleDelete, loading=busy, onClick=handleSave
- Props from ProductEditor: type="submit"
- Props from LoginForm: type="submit", loading=isSubmitting
- Props from CartDrawer: onClick=goToCheckout, disabled=!items.length
- Props from CartItem: variant="ghost", size="sm", onClick=() => dispatch(removeItem(line.product.id))
- Props from OrderSummary: variant="secondary", onClick=handleApply
- Props from AddressForm: type="submit"
- Props from CheckoutWizard: onClick=handlePlaceOrder, loading=status === 'submitting'
- Props from PaymentForm: variant="ghost", type="button", onClick=this.props.onBack, type="submit", disabled=!sdkReady
- Props from AddToCartButton: onClick=handleAdd, loading=isPending, disabled=product.stock === 0
- Props from Filters: onClick=handleApply, variant="ghost", onClick=() => dispatch({ type: 'reset' })
- CSS classes: btn (app/globals.css:8), btn-
- Renders: Spinner(size)
- Used by: CartPage, Header, HeroBanner, Modal, ProfileForm, ErrorBoundary, OrderEditor, ProductEditor, LoginForm, CartDrawer, CartItem, OrderSummary, AddressForm, CheckoutWizard, PaymentForm, AddToCartButton, Filters
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 30 component(s) and 13 page(s); update every caller listed under "Used by".

## Modal
`src/components/ui/Modal.tsx:16` · function · client component · named export · moderate

Accessible dialog rendered into document.body. Locks page scroll and closes on Escape.

- Owners: @northwind/design-system
- Props: `open: boolean`, `title: string`, `onClose: () => void`, `children: React.ReactNode`, `footer?: React.ReactNode`
- Refs: `dialogRef`, `previousFocus`
- Hooks: useRef×2, useEffect
- Effect `useEffect` L20: mount+update+unmount (deps [open, onClose]) → onClose, document.addEventListener; cleanup → document.removeEventListener, document.body.style.removeProperty
- Props from OrderEditor: open=!!order, title=`Edit order ${order?.id ?? ''}`, onClose=onClose, footer=<><Button variant="danger" onClick={handleDelete}…
- Props from CartDrawer: open=open, title=`Your cart (${items.length})`, onClose=close, footer=<Button onClick={goToCheckout} disabled={!items.l…
- Timer `document.addEventListener`('keydown') in useEffect L20 (line 24): released
- CSS classes: backdrop (app/globals.css:35)
- ⚠ LOW a11y-click-handler L36: click handler on <div> without a role or keyboard handler; keyboard users cannot trigger it. Fix: use a <button>, or add role="button", tabIndex={0} and a key handler
- Renders: Button(variant, onClick)
- Used by: OrderEditor, CartDrawer
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 5 component(s) and 13 page(s); update every caller listed under "Used by".

## TabsList
`src/components/ui/Tabs.tsx:16` · function · client component · none export · trivial

- Owners: @northwind/design-system
- Props: `children: React.ReactNode`
- Used by: FeaturedCollections
- Pages: /
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## TabsTrigger
`src/components/ui/Tabs.tsx:20` · function · client component · none export · trivial

- Owners: @northwind/design-system
- Props: `value: string`, `children: React.ReactNode`
- Hooks: useTabs
- Props from FeaturedCollections: key=c.value, value=c.value
- Reads context:TabsContext via useTabs
- Used by: FeaturedCollections
- Pages: /
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## DataTable
`src/components/ui/DataTable.tsx:23` · function · client component · named export · complex

Generic sortable, paginated table used by every admin list.

- Owners: @northwind/design-system
- Props: `rows: T[]`, `columns: Column<T>[]`, `onRowClick?: (row: T) => void`, `loading?: boolean` = `false`, `emptyText?: string` = `'Nothing here yet'`, `pageSize?: number` = `20`
- State: `sortKey` (useState, init `null`, set via `setSortKey`); `direction` (useState, init `'asc'`, set via `setDirection`); `page` (useState, init `0`, set via `setPage`)
- Hooks: useState×3, useMemo
- Props from RecentOrders: rows=orders, columns=COLUMNS, loading=loading, onRowClick=onSelect, emptyText="No orders yet"
- Variables: sorted, visible
- CSS classes: empty
- ⚠ LOW a11y-click-handler L43: click handler on <tr> without a role or keyboard handler; keyboard users cannot trigger it. Fix: use a <button>, or add role="button", tabIndex={0} and a key handler
- Renders: Spinner(label)
- Used by: RecentOrders
- Pages: /admin/orders, /admin
- Impact: changing the props/export affects 3 component(s) and 2 page(s); update every caller listed under "Used by".

## TabsPanel
`src/components/ui/Tabs.tsx:25` · function · client component · none export · trivial

- Owners: @northwind/design-system
- Props: `value: string`, `children: React.ReactNode`
- Hooks: useTabs
- Props from FeaturedCollections: key=c.value, value=c.value
- Reads context:TabsContext via useTabs
- Used by: FeaturedCollections
- Pages: /
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".
