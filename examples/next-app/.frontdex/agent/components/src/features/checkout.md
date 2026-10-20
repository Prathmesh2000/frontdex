# src/features/checkout

5 component(s). Index: `.frontdex/agent/INDEX.md`

## AddressStep
`src/features/checkout/AddressStep.tsx:5` · function · client component · named export · simple

Wizard step 1. Passes the draft address down to AddressForm (prop drilling demo).

- Owners: @northwind/web
- Props: `draft: Partial<Address>`, `onNext: (a: Address) => void`, `onBack?: () => void`
- Props from CheckoutWizard: draft=state.address, onNext=(address) => dispatchWizard({ type: 'address', ad…
- ⚠ LOW unused-prop L5: prop `onBack` is destructured but never used. Fix: remove it from the props or use it
- Renders: AddressForm(initial, onSubmit, submitLabel)
- Used by: CheckoutWizard
- Pages: /checkout
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## StepIndicator
`src/features/checkout/StepIndicator.tsx:6` · function · client component · named export · trivial

"1 — 2 — 3" progress header for the checkout wizard.

- Owners: @northwind/web
- Props: `current: number`, `completed: number[]`
- Props from CheckoutWizard: current=state.step, completed=state.completed
- CSS classes: steps, flex, gap-4, step, active, done
- Used by: CheckoutWizard
- Pages: /checkout
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## AddressForm
`src/features/checkout/AddressForm.tsx:15` · function · client component · named export · moderate

Shipping address fields validated with the zod addressSchema.

- Owners: @northwind/web
- Props: `initial: Partial<Address>`, `onSubmit: (address: Address) => void`, `submitLabel?: string` = `'Continue'`
- State: `values` (useState, init `initial`, set via `setValues`); `errors` (useState, init `{}`, set via `setErrors`)
- Hooks: useState×2
- Props from AddressStep: initial=draft, onSubmit=onNext, submitLabel="Continue to payment"
- Function `update(field: keyof Address)` L19 sets values → setValues
- Handler `handleSubmit(e: React.FormEvent)` L21 sets errors → e.preventDefault, addressSchema.safeParse, setErrors, Object.fromEntries, onSubmit
- Validation (zod): addressSchema [name, street, city, zip, country]
- Validation (html): Full name [required, minLength]
- Validation (html): Street [required]
- Validation (html): City [required]
- Validation (html): ZIP [required, pattern]
- Validation (html): Country [required]
- CSS module `src/features/checkout/Checkout.module.css`: step, actions
- Renders: Input(label, required, minLength, value, error, onChange, label, required, value, error, onChange, label, required, value, error, onChange, label, required, pattern, inputMode, value, error, onChange, label, required, value, error, onChange), Button(type)
- Used by: AddressStep
- Pages: /checkout
- Impact: changing the props/export affects 3 component(s) and 1 page(s); update every caller listed under "Used by".

## PaymentForm
`src/features/checkout/PaymentForm.tsx:21` · class · client component · named export · heavy

Card entry. Class component because it wraps the imperative payments SDK.

- Owners: @northwind/web
- Props: `amount: number`, `onPaid: (token: string) => void`, `onBack: () => void`
- State: `card` (class, init `''`, set via `this.setState`); `expiry` (class, init `''`, set via `this.setState`); `error` (class, init `null`, set via `this.setState`); `sdkReady` (class, init `false`, set via `this.setState`); `secondsLeft` (class, init `600`, set via `this.setState`)
- Effect `componentDidMount` L25: mount → document.createElement, this.setState, document.body.appendChild, setInterval
- Effect `componentDidUpdate` L33: update → this.setState
- Effect `componentWillUnmount` L37: unmount → clearInterval
- Props from CheckoutWizard: amount=amount, onPaid=(token) => dispatchWizard({ type: 'paid', token }), onBack=() => dispatchWizard({ type: 'back' })
- Variables: sessionTimer
- Handler `async handleSubmit(e: React.FormEvent)` L41 → e.preventDefault, validateCard, this.setState, validateExpiry, fetch, JSON.stringify
- Timer `setInterval` in componentDidMount (line 30): released
- API POST `/api/payments/tokenize` via fetch in handleSubmit (line 45)
- Validation (custom): validateCard
- Validation (custom): validateExpiry
- Validation (html): Card number [required]
- Validation (html): Expiry (MM/YY) [required, pattern]
- CSS module `src/features/checkout/Checkout.module.css`: step, error, actions
- Renders: Input(label, required, inputMode, autoComplete, value, onChange, label, required, pattern, value, onChange), Button(variant, type, onClick, type, disabled)
- Used by: CheckoutWizard
- Pages: /checkout
- Impact: changing the props/export affects 2 component(s) and 1 page(s); update every caller listed under "Used by".

## CheckoutWizard
`src/features/checkout/CheckoutWizard.tsx:45` · function · client component · named export · complex

Three-step checkout state machine: address → payment → review. Persists a draft in sessionStorage.

- Owners: @northwind/web
- Props: `userEmail?: string`
- State: `state` (useReducer, init `{ step: 0, address: {}, paymentToken: null, completed: [] }`, set via `dispatchWizard`)
- Hooks: useReducer, useAppSelector×3, useAppDispatch, useRouter, useToast, useEffect×2, useCallback
- Effect `useEffect` L55: mount (once) → sessionStorage.getItem, dispatchWizard, JSON.parse
- Effect `useEffect` L60: mount+update (deps [state]) → sessionStorage.setItem, JSON.stringify
- Props from CheckoutPage: userEmail=user?.email
- Variables: amount
- Handler `async handlePlaceOrder()` L64 → dispatch, checkout, checkout.fulfilled.match, sessionStorage.removeItem, notify
- Reads redux:cart `cart.items` via useAppSelector
- Reads redux:cart `cart.coupon` via useAppSelector
- Reads redux:cart `cart.status` via useAppSelector
- Reads context:ToastContext via useToast
- Writes redux:cart: `checkout` via dispatch in inline callback
- CSS module `src/features/checkout/Checkout.module.css`: wizard, step
- ⚠ LOW unused-prop L45: prop `userEmail` is destructured but never used. Fix: remove it from the props or use it
- Renders: StepIndicator(current, completed), AddressStep(draft, onNext), PaymentForm(amount, onPaid, onBack), CartItem(key, line, readOnly), Button(onClick, loading), OrderSummary(lines, coupon, readOnly)
- Used by: CheckoutPage
- Pages: /checkout
- Impact: changing the props/export affects 1 component(s) and 1 page(s); update every caller listed under "Used by".
