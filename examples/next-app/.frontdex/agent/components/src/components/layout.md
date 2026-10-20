# src/components/layout

6 component(s). Index: `.frontdex/agent/INDEX.md`

## Footer
`src/components/layout/Footer.jsx:5` · function · server component · named export · simple

Site footer with legal links. Plain JS component kept from the v1 codebase.

- Owners: @northwind/web
- Props: `year?: number` = `2026`, `links: arrayOf(PropTypes.shape({ href: PropTypes.string, label: PropTypes.string }))`, `compact?: bool` = `false`
- Props from RootLayout: links=FOOTER_LINKS, year=new Date().getFullYear()
- CSS classes: footer, compact (app/globals.css:5)
- Libraries: next/link#Link
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".

## LegacyButton
`src/components/layout/LegacyButton.jsx:7` · class · server component · default export · simple · DEPRECATED

Button from the old design system.

- Owners: @northwind/web
- Props: `kind?: unknown` = `'default'`, `onPress?: unknown` = `() => {}`, `children?: unknown`
- Props from BlogPage: kind="primary"
- Handler `handleClick(event)` L10 → event.preventDefault, this.props.onPress
- CSS classes: legacy-btn (app/globals.css:37), legacy-btn--
- ⚠ HIGH client-code-in-server-component: LegacyButton is a class component but renders as a Server Component. Fix: add 'use client' at the top of its file, or render it from a client component
- ⚠ LOW possible-duplicate: LegacyButton looks like Button (same base name "Button"; 1/8 props shared). Fix: reuse or extend Button, or merge the two
- Used by: BlogPage
- Pages: /blog/[[...slug]]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## OldPromoBanner
`src/components/layout/OldPromoBanner.tsx:7` · function · default export · simple · DEPRECATED

Promo strip from the 2024 redesign.

- Owners: @northwind/web
- Props: `message: string`, `dismissible?: boolean` = `true`
- State: `hidden` (useState, init `false`, set via `setHidden`)
- Hooks: useState
- CSS classes: promo-strip
- Used by: nothing (unused or entry point)

## CartBadge
`src/components/layout/CartBadge.tsx:14` · class · client component · default export · moderate

Legacy class component wired to Redux with connect(). Pulses when the count changes.

- Owners: @northwind/web
- Props: `count: number`, `onClear: () => void`, `max?: number` = `99`
- State: `pulse` (class, init `false`, set via `this.setState`)
- Effect `componentDidUpdate` L19: update → this.setState, setTimeout
- Effect `componentWillUnmount` L26: unmount → clearTimeout
- Variables: pulseTimer
- Timer `setTimeout` in componentDidUpdate (line 22): released
- Reads redux:cart `cart.items` via connect
- Writes redux:cart: `clearCart` via connect
- CSS classes: badge (app/globals.css:22), badge-success (app/globals.css:24), pulse (app/globals.css:27)
- Used by: Header
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 2 component(s) and 13 page(s); update every caller listed under "Used by".

## HeroBanner
`src/components/layout/HeroBanner.tsx:14` · function · client component · named export · moderate

Homepage hero with a live promo countdown.

- Owners: @northwind/web
- Props: `headline: string`, `endsAt: string`, `ctaHref?: string` = `'/products'`
- State: `remaining` (useState, init `() => Date.parse(endsAt) - Date.now()`, set via `setRemaining`)
- Hooks: useState, useEffect
- Effect `useEffect` L17: mount+update (deps [endsAt]) → setInterval, setRemaining, Date.parse, Date.now
- Props from HomePage: headline="Autumn sale — up to 40% off", endsAt="2026-11-01T00:00:00Z"
- Variables: hours, minutes
- Timer `setInterval` in useEffect L17 (line 19): NOT RELEASED
- CSS classes: hero, grid (app/globals.css:6), md:grid-cols-2, gap-8, text-4xl, font-bold, countdown
- ⚠ HIGH memory-leak L19: setInterval started in useEffect L17 without cleanup. Fix: return () => clearInterval(id) from the effect
- Renders: Button(size, onClick)
- Libraries: next/image#Image
- Used by: HomePage
- Pages: /
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## Header
`src/components/layout/Header.tsx:21` · function · client component · named export · moderate

Sticky top navigation: search, account, theme toggle and the cart drawer trigger.

- Owners: @northwind/web
- State: `scrolled` (useState, init `false`, set via `setScrolled`)
- Hooks: useAuth, useTheme, useAppDispatch, useState, useEffect
- Effect `useEffect` L27: mount+unmount (once) → setScrolled, window.addEventListener; cleanup → window.removeEventListener
- Handler `onToggleCart()` L33 → dispatch, toggleDrawer
- Timer `window.addEventListener`('scroll') in useEffect L27 (line 29): released
- Reads context:AuthContext via useAuth
- Reads context:ThemeContext via useTheme
- Writes redux:ui: `toggleDrawer` via dispatch in handler onToggleCart
- CSS classes: site-header (app/globals.css:4), sticky, top-0, shadow-md, compact (app/globals.css:5), logo
- Renders: SearchBar(placeholder), Button(variant, size, onClick, aria-label, variant, size, onClick, variant, size, onClick, icon), CartBadge, CartDrawer
- Libraries: next/link#Link
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".
