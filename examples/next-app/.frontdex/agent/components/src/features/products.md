# src/features/products

9 component(s). Index: `.frontdex/agent/INDEX.md`

## ProductGallery
`src/features/products/ProductGallery.tsx:6` · function · client component · named export · moderate

Image carousel with arrow-key navigation.

- Props: `images: string[]`, `alt: string`
- State: `index` (useState, init `0`, set via `setIndex`); `zoomed` (useState, init `false`, set via `setZoomed`)
- Hooks: useState×2, useEffect
- Effect `useEffect` L10: mount+update+unmount (deps [images.length]) → setIndex, window.addEventListener; cleanup → window.removeEventListener
- Props from ProductDetailPage: images=[product.image], alt=product.name
- Timer `window.addEventListener`('keydown') in useEffect L10 (line 15): released
- CSS classes: gallery, zoomed, thumbs, flex, gap-2
- Libraries: next/image#Image
- Used by: ProductDetailPage
- Pages: /products/[id]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## ProductInfo
`src/features/products/ProductInfo.tsx:7` · function · server component · named export · simple

Title, price, stock and the add-to-cart controls.

- Props: `product: Product`, `showSku?: boolean` = `false`
- Props from ProductDetailPage: product=product
- Variables: inStock
- CSS classes: product-info, price
- ⚠ LOW unused-prop L7: prop `showSku` is destructured but never used. Fix: remove it from the props or use it
- Renders: Badge(tone), AddToCartButton(product, maxQuantity)
- Used by: ProductDetailPage
- Pages: /products/[id]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## RelatedProducts
`src/features/products/RelatedProducts.tsx:8` · function · client component · named export · moderate

"You may also like" strip.

- Props: `category: string`, `excludeId: string`, `limit?: number` = `4`
- State: `items` (useState, init `[]`, set via `setItems`)
- Hooks: useState, useEffect
- Effect `useEffect` L11: mount+update+unmount (deps [category, limit]) → getProducts, setItems
- Props from ProductDetailPage: category=product.category, excludeId=product.id
- API CALL `getProducts()` via service in useEffect L11 (line 13)
- CSS classes: related, grid (app/globals.css:6), grid-cols-4, gap-4
- ⚠ LOW missing-dependency L11: useEffect L11 reads excludeId but its dependency array is [category, limit]: stale values possible. Fix: add excludeId to the dependency array
- Renders: ProductCard(key, product, compact)
- Used by: ProductDetailPage
- Pages: /products/[id]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## Reviews
`src/features/products/Reviews.tsx:8` · function · client component · default export · moderate

Customer reviews, loaded lazily below the fold.

- Props: `productId: string`
- State: `reviews` (useState, init `null`, set via `setReviews`); `expanded` (useState, init `false`, set via `setExpanded`)
- Hooks: useState×2, useEffect
- Effect `useEffect` L12: mount+update (deps [productId]) → fetch, setReviews
- Props from ProductDetailPage: productId=product.id
- Variables: visible
- API GET `/api/products/${productId}/reviews` via fetch in useEffect L12 (line 14)
- CSS classes: reviews
- ⚠ MEDIUM unsafe-async-update L12: useEffect L12 sets state (setReviews) after async work with no cleanup; it can run after unmount or out of order. Fix: use an AbortController or an `ignore` flag set in the cleanup
- Renders: Spinner(label)
- Used by: ProductDetailPage
- Pages: /products/[id]
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## AddToCartButton
`src/features/products/AddToCartButton.tsx:11` · function · client component · named export · moderate

Quantity picker + add button for the product page.

- Props: `product: Product`, `maxQuantity?: number` = `10`
- State: `quantity` (useState, init `1`, set via `setQuantity`)
- Hooks: useState, useTransition, useAppSelector, useAppDispatch, useToast
- Props from ProductInfo: product=product, maxQuantity=Math.min(product.stock, 10)
- Handler `handleAdd()` L18 → startTransition, dispatch, addItem, updateQuantity, trackEvent, notify
- API CALL `trackEvent()` via service in inline callback (line 22)
- Reads redux:cart `cart.items` via useAppSelector
- Reads context:ToastContext via useToast
- Writes redux:cart: `addItem` via dispatch in inline callback
- Writes redux:cart: `updateQuantity` via dispatch in inline callback
- Validation (html): Qty [required, min, max, type=number]
- CSS classes: flex, gap-2, items-end
- Renders: Input(label, type, min, max, required, value, onChange), Button(onClick, loading, disabled)
- Used by: ProductInfo
- Pages: /products/[id]
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## FeaturedCollections
`src/features/products/FeaturedCollections.tsx:12` · function · client component · named export · simple

Tabbed product collections on the homepage (compound Tabs).

- Props: `defaultTab?: string` = `'new'`
- Props from HomePage: defaultTab="bestsellers"
- Renders: TabsRoot(defaultValue), TabsList, TabsTrigger(key, value), TabsPanel(key, value), ProductGrid(category, pageSize)
- Used by: HomePage
- Pages: /
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## Filters
`src/features/products/Filters.tsx:17` · function · client component · named export · simple

Sidebar filters; applies them to the URL query string.

- Props: `categories: string[]`
- State: `filters` (useReducer, init `{ ...EMPTY, category: params.get('category') ?? 'all' }`, set via `dispatch`)
- Hooks: useSearchParams, useRouter, usePathname, useReducer
- Props from ProductsPage: categories=CATEGORIES
- Handler `handleApply()` L23 → next.set, String
- Validation (html): Min price [min, type=number]
- Validation (html): Max price [min, type=number]
- CSS classes: filters
- Renders: Input(label, type, min, value, onChange, label, type, min, value, onChange), Button(onClick, variant, onClick)
- Used by: ProductsPage
- Pages: /products
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## ProductGrid
`src/features/products/ProductGrid.tsx:19` · function · client component · named export · moderate

Responsive grid of products for a category. Column count follows the container width.

- Props: `category?: string` = `'all'`, `sort?: 'price' | 'rating' | 'newest'` = `'newest'`, `pageSize?: number` = `24`
- State: `columns` (useState, init `4`, set via `setColumns`)
- Refs: `containerRef`
- Hooks: useSWR, useRef, useState, useAppDispatch, useToast, useEffect
- Effect `useEffect` L26: mount+unmount (once) → setColumns, Math.max, Math.floor, observer.observe; cleanup → observer.disconnect
- Props from ProductsPage: category=category, sort=sort
- Props from FeaturedCollections: category=c.category, pageSize=8
- Handler `handleAdd(product: Product)` L33 → dispatch, addItem, notify
- Timer `new ResizeObserver` in useEffect L26 (line 28): released
- API GET `/api/products?category=${category}&sort=${sort}&limit=${pageSize}` via useSWR in render (line 20)
- Reads context:ToastContext via useToast
- Writes redux:cart: `addItem` via dispatch in handler handleAdd
- CSS classes: error (app/globals.css:34), grid (app/globals.css:6)
- Renders: Spinner(label), ProductCard(key, product, onAdd, highlight)
- Used by: ProductsPage, FeaturedCollections
- Pages: /, /products
- Impact: changing the props/export affects 3 component(s) and 2 page(s); update every caller listed under "Used by".

## ProductCard
`src/features/products/ProductCard.tsx:20` · memo · client component · named export · simple

Product tile used in grids, search results and related products.

- Props: `product: Product`, `onAdd?: (product: Product) => void`, `compact?: boolean` = `false`, `highlight?: string`
- Props from ProductGrid: key=p.id, product=p, onAdd=handleAdd, highlight=p.rating && p.rating > 4.5 ? 'Top rated' : undefi…
- Props from RelatedProducts: key=p.id, product=p, compact=true
- Props from SearchResults: key=p.id, product=p, compact=true
- Variables: soldOut, lowStock
- CSS classes: btn (app/globals.css:8), btn-primary (app/globals.css:9), btn-sm (app/globals.css:13)
- CSS module `src/features/products/ProductCard.module.css`: card, compact, soldOut, image, price
- Renders: Card(elevated), Badge(tone, tone), Tooltip(text)
- Libraries: next/link#Link, next/image#Image
- Used by: ProductGrid, RelatedProducts, SearchResults
- Pages: /, /products/[id], /products, /search
- Impact: changing the props/export affects 8 component(s) and 4 page(s); update every caller listed under "Used by".
