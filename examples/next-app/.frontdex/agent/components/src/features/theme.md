# src/features/theme

1 component(s). Index: `.frontdex/agent/INDEX.md`

## ThemeProvider
`src/features/theme/ThemeContext.tsx:8` · function · named export · moderate

Follows the OS colour scheme until the user picks one.

- Props: `children: React.ReactNode`
- State: `theme` (useState, init `'light'`, set via `setTheme`); `userChoice` (useState, init `null`, set via `setUserChoice`)
- Hooks: useState×2, useEffect, useLayoutEffect
- Effect `useEffect` L12: mount+update+unmount (deps [userChoice]) → window.matchMedia, setTheme, onChange, media.addEventListener; cleanup → media.removeEventListener
- Effect `useLayoutEffect` L20: mount+update (deps [theme])
- Function `toggleTheme()` L24 sets userChoice, theme → setUserChoice, setTheme
- Timer `media.addEventListener`('change') in useEffect L12 (line 16): released
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".
