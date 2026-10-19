# app/cart

1 component(s). Index: `.catalogue/agent/INDEX.md`

## CartPage
`app/cart/page.tsx:10` · function · default export · simple

Full cart page. Reads lines and coupon from Redux and passes them down as props.

- Hooks: useAppSelector×2, useAppDispatch
- Reads redux:cart `cart.items` via useAppSelector
- Reads redux:cart `cart.coupon` via useAppSelector
- Writes redux:cart: `clearCart` via dispatch in inline callback
- CSS classes: grid (app/globals.css:6), md:grid-cols-3, gap-8, md:col-span-2, btn (app/globals.css:8), btn-primary (app/globals.css:9), btn-lg (app/globals.css:15)
- Renders: CartItem(key, line), OrderSummary(lines, coupon), Button(variant, onClick)
- Libraries: next/link#Link
- Used by: nothing (unused or entry point)
- Pages: /cart
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
