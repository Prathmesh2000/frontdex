# react-catalogue → frontdex

`react-catalogue` is now **[frontdex](https://github.com/Prathmesh2000/frontdex)**. This package only re-exports it, so existing configs, imports and the `rcat` command keep working while you switch:

```bash
npm rm react-catalogue && npm i -D frontdex
npx frontdex upgrade   # moves catalogue.config.json, catalogue.yaml and .catalogue/ to the frontdex names
```

| react-catalogue | frontdex |
|---|---|
| `rcat`, `react-catalogue` | `frontdex` (alias `fdx`; `rcat` still works) |
| `react-catalogue/next` → `withCatalogue` | `frontdex/next` → `withFrontdex` |
| `react-catalogue/vite` | `frontdex/vite` |
| `catalogue.config.json`, `catalogue.yaml`, `.catalogue/` | `frontdex.config.json`, `frontdex.yaml`, `.frontdex/` |
