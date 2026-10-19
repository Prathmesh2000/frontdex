# app/(admin)/admin/orders

1 component(s). Index: `.frontdex/agent/INDEX.md`

## AdminOrdersPage
`app/(admin)/admin/orders/page.tsx:7` · function · default export · simple

- State: `selected` (useState, init `null`, set via `setSelected`); `version` (useState, init `0`, set via `setVersion`)
- Hooks: useState×2
- Renders: RecentOrders(key, limit, onSelect), OrderEditor(order, onClose, onSaved)
- Used by: nothing (unused or entry point)
- Pages: /admin/orders
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
