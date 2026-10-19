# app/products/[id]

1 component(s). Index: `.catalogue/agent/INDEX.md`

## ProductDetailPage
`app/products/[id]/page.tsx:16` · function · default export · simple

Product detail: gallery, info, lazy reviews and related items.

- Props: `params: Promise<{ id: string }>`
- Variables: id, product
- CSS classes: grid (app/globals.css:6), md:grid-cols-2, gap-10
- Renders: ProductGallery(images, alt), ProductInfo(product), Reviews(productId), RelatedProducts(category, excludeId)
- Used by: nothing (unused or entry point)
- Pages: /products/[id]
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
