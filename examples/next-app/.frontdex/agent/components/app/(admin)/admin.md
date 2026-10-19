# app/(admin)/admin

2 component(s). Index: `.frontdex/agent/INDEX.md`

## AdminLayout
`app/(admin)/admin/layout.tsx:6` · function · server component · default export · trivial

Admin shell: role-gated, with sidebar and an error boundary around content.

- Owners: @northwind/web
- Props: `children: React.ReactNode`
- CSS classes: flex
- Renders: ProtectedRoute(role), AdminSidebar, ErrorBoundary(fallbackTitle)
- Used by: nothing (unused or entry point)
- Pages: /admin/orders, /admin, /admin/products/[...slug]
- Impact: changing the props/export affects 0 component(s) and 3 page(s); update every caller listed under "Used by".

## AdminDashboard
`app/(admin)/admin/page.tsx:7` · function · server component · default export · trivial

Admin dashboard: KPIs, revenue chart, live visitors and recent orders.

- Owners: @northwind/web
- CSS classes: grid (app/globals.css:6), gap-6
- Renders: StatCard(title, metrics), LiveVisitors(channel), SalesPanel(range), RecentOrders(limit)
- Used by: nothing (unused or entry point)
- Pages: /admin
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
