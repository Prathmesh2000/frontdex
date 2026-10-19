# src/pages/settings

4 component(s). Index: `.catalogue/agent/INDEX.md`

## SettingsLayout
`src/pages/settings/SettingsLayout.jsx:4` · function · default export · trivial

Settings tabs (nested routes).

- CSS classes: tabs (src/styles.css:7)
- Libraries: react-router-dom#NavLink, react-router-dom#Outlet
- Used by: nothing (unused or entry point)
- Pages: /settings, /settings/profile, /settings/billing, /settings/security
- Impact: changing the props/export affects 0 component(s) and 4 page(s); update every caller listed under "Used by".

## BillingSettings
`src/pages/settings/BillingSettings.jsx:5` · function · default export · simple

Plan and invoices.

- State: `invoices` (useState, init `[]`, set via `setInvoices`)
- Hooks: useState, useEffect
- Effect `useEffect` L7: mount+unmount (once) → api.get, setInvoices; cleanup → controller.abort
- API GET `/billing/invoices` via api.get in useEffect L7 (line 9)
- Used by: nothing (unused or entry point)
- Pages: /settings/billing
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".

## ProfileSettings
`src/pages/settings/ProfileSettings.jsx:5` · function · default export · trivial

Current admin's own profile.

- Function `save(values)` L6 → api.patch
- API PATCH `/me` via api.patch in handler save (line 6)
- Renders: UserForm(initial, onSubmit)
- Used by: nothing (unused or entry point)
- Pages: /settings, /settings/profile
- Impact: changing the props/export affects 0 component(s) and 2 page(s); update every caller listed under "Used by".

## SecuritySettings
`src/pages/settings/SecuritySettings.jsx:7` · function · default export · simple

Password change + 2FA toggle.

- State: `password` (useState, init `''`, set via `setPassword`); `twoFactor` (useState, init `false`, set via `setTwoFactor`)
- Hooks: useState×2
- Variables: strong
- Handler `async handleSubmit(e)` L12 → e.preventDefault, api.post
- API POST `/me/password` via api.post in handler handleSubmit (line 14)
- Validation (html): input [required, minLength]
- CSS classes: form-error (src/styles.css:6)
- Used by: nothing (unused or entry point)
- Pages: /settings/security
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".
