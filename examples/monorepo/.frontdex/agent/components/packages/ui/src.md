# packages/ui/src

3 component(s). Index: `.frontdex/agent/INDEX.md`

## Badge
`packages/ui/src/badge.tsx:2` · function · named export · trivial

- Props: `label: string`
- CSS classes: badge
- Used by: nothing (unused or entry point)

## Card
`packages/ui/src/card.tsx:3` · function · server component · named export · trivial

- Props: `title: string`, `children: ReactNode`
- Props from Dashboard: title="Dashboard"
- Props from Users: title="Users"
- Props from HomePage: title="Get started"
- CSS classes: card
- Used by: Dashboard, Users, HomePage
- Pages: /, / (@acme/admin), /users
- Impact: changing the props/export affects 3 component(s) and 3 page(s); update every caller listed under "Used by".

## Button
`packages/ui/src/button.tsx:4` · function · server component · named export · simple

Primary action button shared by every Acme app.

- Props: `variant?: 'primary' | 'ghost'` = `'primary'`, `onClick?: () => void`, `children: ReactNode`
- Props from Dashboard: onClick=() => window.location.reload()
- Props from HomePage: variant="primary"
- Props from SettingsPage: variant="ghost"
- CSS classes: btn, btn-
- Used by: Dashboard, HomePage, SettingsPage
- Pages: /, /settings, / (@acme/admin)
- Impact: changing the props/export affects 3 component(s) and 3 page(s); update every caller listed under "Used by".
