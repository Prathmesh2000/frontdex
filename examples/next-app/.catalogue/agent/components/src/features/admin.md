# src/features/admin

10 component(s). Index: `.catalogue/agent/INDEX.md`

## Card
`src/features/admin/Card.tsx:2` · function · named export · simple

Admin-only metric card (different from the design-system Card).

- Props: `label: string`, `value: string`, `delta?: number`
- Props from StatCard: key=m.label, ...m=spread
- Variables: trend
- CSS classes: admin-card, rounded-lg, p-4, bg-slate-900, text-white, text-xs, uppercase, text-2xl, trend-
- Used by: StatCard
- Pages: /admin
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## LiveVisitors
`src/features/admin/LiveVisitors.tsx:4` · class · named export · moderate

Live visitor counter fed by a server-sent events stream.

- Props: `channel: string`
- State: `count` (class, init `0`, set via `this.setState`); `online` (class, init `navigator.onLine`, set via `this.setState`)
- Effect `componentDidMount` L8: mount → this.setState, Number, window.addEventListener
- Props from AdminDashboard: channel="storefront"
- Variables: source
- Timer `new EventSource` in componentDidMount (line 9): NOT RELEASED
- Timer `window.addEventListener`('online') in componentDidMount (line 12): NOT RELEASED
- CSS classes: live, offline
- ⚠ HIGH memory-leak L9: new EventSource started in componentDidMount with no matching release in componentWillUnmount. Fix: release it in componentWillUnmount
- ⚠ HIGH memory-leak L12: window.addEventListener('online') started in componentDidMount with no matching release in componentWillUnmount. Fix: release it in componentWillUnmount
- Used by: AdminDashboard
- Pages: /admin
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## StatCard
`src/features/admin/StatCard.tsx:5` · function · named export · simple

Dashboard KPI tile: design-system Card shell around the admin metric card.

- Props: `title: string`, `metrics: { label: string; value: string; delta?: number }[]`
- Props from AdminDashboard: title="Today", metrics=[{ label: 'Revenue', value: '$12,480', delta: 8 }…
- CSS classes: grid (app/globals.css:6), grid-cols-3, gap-2
- Renders: Card(elevated), CardHeader(title), CardBody, Card(key, ...m)
- Used by: AdminDashboard
- Pages: /admin
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## ProductEditor
`src/features/admin/ProductEditor.tsx:8` · function · named export · moderate

Create or edit a product. `productId` undefined means "new".

- Props: `productId?: string`
- State: `product` (useState, init `{ name: '', price: 0, stock: 0, category: '' }`, set via `setProduct`); `loading` (useState, init `!!productId`, set via `setLoading`)
- Hooks: useState×2, useEffect
- Effect `useEffect` L12: mount+update+unmount (deps [productId]) → http.get, setProduct, setLoading; cleanup → controller.abort
- Props from AdminProductPage: productId=productId
- Handler `async handleSubmit(e: React.FormEvent)` L22 → e.preventDefault, http.put, http.post
- API GET `/products/${productId}` via http.get in useEffect L12 (line 15)
- API PUT `/products/${productId}` via http.put in handler handleSubmit (line 24)
- API POST `/products` via http.post in handler handleSubmit (line 25)
- Validation (html): Name [required, minLength]
- Validation (html): Price (cents) [required, min, type=number]
- Validation (html): Stock [min, type=number]
- Renders: Spinner, Input(label, required, minLength, value, onChange, label, type, required, min, value, onChange, label, type, min, value, onChange), Button(type)
- Used by: AdminProductPage
- Pages: /admin/products/[...slug]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## SalesChart
`src/features/admin/SalesChart.tsx:8` · class · named export · heavy

Canvas revenue chart. Class component with the full lifecycle for imperative drawing.

- Props: `data: Point[]`, `width: number`, `height?: number` = `240`, `currency?: string` = `'USD'`
- State: `max` (class, init `0`, set via `this.setState`); `hovered` (class, init `null`, set via `this.setState`); `prevData` (class, init `[]`, set via `this.setState`)
- Refs: `canvasRef`
- Effect `constructor` L13: mount → this.handleMove.bind
- Effect `getDerivedStateFromProps` L19: mount+update → Math.max
- Effect `componentDidMount` L24: mount → this.draw
- Effect `shouldComponentUpdate` L29: update
- Effect `getSnapshotBeforeUpdate` L33: update
- Effect `componentDidUpdate` L37: update → console.debug, cancelAnimationFrame, requestAnimationFrame, this.draw
- Effect `componentWillUnmount` L43: unmount → cancelAnimationFrame
- Props from SalesPanel: data=data, width=width
- Variables: canvasRef, frame
- Handler `handleMove(e: MouseEvent)` L48 → Math.floor, this.setState
- Function `draw()` L53 → ctx.clearRect, ctx.fillRect
- Timer `requestAnimationFrame` in componentDidUpdate (line 40): released
- CSS classes: chart
- Used by: SalesPanel
- Pages: /admin
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## SalesPanel
`src/features/admin/SalesPanel.tsx:8` · function · named export · moderate

Sizes the chart to the window and loads the revenue series.

- Props: `range?: '7d' | '30d' | '90d'` = `'30d'`
- State: `width` (useState, init `800`, set via `setWidth`)
- Hooks: useSWR, useState, useEffect
- Effect `useEffect` L12: mount (once) → window.addEventListener, setWidth, Math.min
- Props from AdminDashboard: range="30d"
- Timer `window.addEventListener`('resize') in useEffect L12 (line 14): NOT RELEASED
- API GET `/api/admin/sales?range=${range}` via useSWR in render (line 9)
- ⚠ HIGH memory-leak L14: window.addEventListener('resize') started in useEffect L12 without cleanup. Fix: return () => target.removeEventListener(sameEvent, sameHandler) from the effect
- Renders: SalesChart(data, width)
- Used by: AdminDashboard
- Pages: /admin
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## ErrorBoundary
`src/features/admin/ErrorBoundary.tsx:9` · class · named export · moderate

Catches render errors in the admin area and reports them.

- Props: `children: React.ReactNode`, `fallbackTitle?: string`
- State: `error` (class, init `null`, set via `this.setState`)
- Effect `getDerivedStateFromError` L12: error
- Effect `componentDidCatch` L16: error → fetch, JSON.stringify
- Props from AdminLayout: fallbackTitle="The admin panel crashed"
- API POST `/api/errors` via fetch in componentDidCatch (line 17)
- CSS classes: error-panel
- Renders: Button(onClick)
- Used by: AdminLayout
- Pages: /admin/orders, /admin, /admin/products/[...slug]
- Impact: changing the props/export affects 1 component(s) and 3 page(s); update every caller listed under "Used by".

## OrderEditor
`src/features/admin/OrderEditor.tsx:12` · function · named export · moderate

Modal to change an order's status or delete it.

- Props: `order: Order | null`, `onClose: () => void`, `onSaved: () => void`
- State: `status` (useState, init `order?.status ?? 'pending'`, set via `setStatus`); `busy` (useState, init `false`, set via `setBusy`)
- Hooks: useState×2, useToast
- Props from AdminOrdersPage: order=selected, onClose=() => setSelected(null), onSaved=() => { setSelected(null); setVersion((v) => v + …
- Variables: unusedDraftNote (UNUSED)
- Handler `async handleSave()` L18 sets busy → setBusy, http.patch, notify, onSaved
- Handler `async handleDelete()` L27 → confirm, http.delete, onSaved
- API PATCH `/orders/${order.id}` via http.patch in handler handleSave (line 21)
- API DELETE `/orders/${order.id}` via http.delete in handler handleDelete (line 29)
- Reads context:ToastContext via useToast
- ⚠ LOW unused-variable L16: `unusedDraftNote` is declared but never used. Fix: remove it
- Renders: Modal(open, title, onClose, footer), Button(variant, onClick, loading, onClick), Card, CardHeader(title, action), Badge, CardBody
- Used by: AdminOrdersPage
- Pages: /admin/orders
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## AdminSidebar
`src/features/admin/AdminSidebar.tsx:14` · function · named export · moderate

Left navigation for the admin area.

- Props: `collapsed?: boolean` = `false`
- State: `renders` (useState, init `0`, set via `setRenders`)
- Hooks: usePathname, useAuth, useState, useEffect
- Effect `useEffect` L19: mount+update (every render) → setRenders
- Reads context:AuthContext via useAuth
- CSS classes: sidebar, w-16, w-60, text-sm, active
- ⚠ HIGH render-loop L19: useEffect L19 has no dependency array and calls setRenders unconditionally: infinite re-render loop. Fix: add a dependency array or guard the update
- Libraries: next/link#Link
- Used by: AdminLayout
- Pages: /admin/orders, /admin, /admin/products/[...slug]
- Impact: changing the props/export affects 1 component(s) and 3 page(s); update every caller listed under "Used by".

## RecentOrders
`src/features/admin/RecentOrders.tsx:16` · function · named export · moderate

Latest orders table on the dashboard; also reused by the orders page.

- Props: `limit?: number` = `10`, `onSelect?: (order: Order) => void`
- State: `orders` (useState, init `[]`, set via `setOrders`); `loading` (useState, init `true`, set via `setLoading`)
- Hooks: useState×2, useEffect
- Effect `useEffect` L20: mount+update+unmount (deps [limit]) → http.get, setOrders, setLoading; cleanup → controller.abort
- Props from AdminOrdersPage: key=version, limit=100, onSelect=setSelected
- Props from AdminDashboard: limit=5
- API GET `/orders` via http.get in useEffect L20 (line 22)
- Renders: DataTable(rows, columns, loading, onRowClick, emptyText)
- Used by: AdminOrdersPage, AdminDashboard
- Pages: /admin/orders, /admin
- Impact: changing the props/export affects 2 component(s) and 2 page(s); update every caller listed under "Used by".
