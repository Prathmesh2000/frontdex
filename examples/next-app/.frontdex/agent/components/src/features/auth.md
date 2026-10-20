# src/features/auth

3 component(s). Index: `.frontdex/agent/INDEX.md`

## ProtectedRoute
`src/features/auth/ProtectedRoute.tsx:8` · function · client component · named export · simple

Redirects to the login page when there is no session; optionally requires a role.

- Owners: @northwind/web
- Props: `children: React.ReactNode`, `role?: 'admin' | 'customer'`
- Hooks: useAuth, useRouter, usePathname, useEffect
- Effect `useEffect` L14: mount+update (deps [loading, allowed, router, pathname]) → router.replace, encodeURIComponent
- Props from AdminLayout: role="admin"
- Variables: allowed
- Reads context:AuthContext via useAuth
- Renders: Spinner(label)
- Used by: AccountLayout, AdminLayout, CheckoutPage
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /checkout
- Impact: changing the props/export affects 3 component(s) and 6 page(s); update every caller listed under "Used by".

## LoginForm
`src/features/auth/LoginForm.tsx:14` · function · client component · named export · simple

Email + password sign-in, validated with react-hook-form.

- Owners: @northwind/web
- Props: `onSuccess?: () => void`
- State: `serverError` (useState, init `null`, set via `setServerError`)
- Hooks: useAuth, useState, useForm
- Props from AccountPage: onSuccess=() => window.location.assign('/account')
- Handler `async onSubmit(values: LoginValues)` L23 sets serverError → setServerError, signIn
- Reads context:AuthContext via useAuth
- Validation (html): Email [type=email]
- Validation (react-hook-form): email [required, pattern]
- Validation (react-hook-form): password [required, minLength]
- Validation (react-hook-form): remember
- CSS classes: inline-flex, items-center, gap-2, error (app/globals.css:34)
- Renders: Input(label, type, error, ...register('email', { required:…, label, type, error, ...register('password', { requir…), Button(type, loading)
- Used by: AccountPage
- Pages: /account
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".

## AuthProvider
`src/features/auth/AuthContext.tsx:18` · function · client component · named export · moderate

Loads the session once and mirrors auth changes into Redux (user.profile).

- Owners: @northwind/web
- Props: `children: React.ReactNode`
- State: `user` (useState, init `null`, set via `setUser`); `loading` (useState, init `true`, set via `setLoading`)
- Hooks: useState×2, useAppDispatch, useEffect×2
- Effect `useEffect` L23: mount+update+unmount (deps [dispatch]) → authClient.getSession, setUser, dispatch, setProfile, setLoading
- Effect `useEffect` L36: mount+update (deps [dispatch]) → authClient.onAuthStateChanged, setUser, dispatch, setProfile
- Function `async signIn(email: string, password: string)` L44 sets user → authClient.signIn, setUser
- Function `async signOut()` L48 sets user → authClient.signOut, setUser
- Timer `authClient.onAuthStateChanged` in useEffect L36 (line 38): NOT RELEASED
- Writes redux:user: `setProfile` via dispatch in useEffect L23
- Writes redux:user: `setProfile` via dispatch in useEffect L36
- ⚠ HIGH memory-leak L38: authClient.onAuthStateChanged started in useEffect L36 without cleanup. Fix: keep the unsubscribe function and call it in the effect cleanup
- Used by: RootLayout
- Pages: /account/orders/[orderId], /account, /admin/orders, /admin, /admin/products/[...slug], /blog/[[...slug]], /cart, /checkout, /checkout/success, /, /products/[id], /products, /search
- Impact: changing the props/export affects 1 component(s) and 13 page(s); update every caller listed under "Used by".
