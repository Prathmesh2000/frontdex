# src/pages/users

4 component(s). Index: `.catalogue/agent/INDEX.md`

## UserDetail
`src/pages/users/UserDetail.jsx:6` · function · default export · simple

Read-only user profile.

- State: `user` (useState, init `null`, set via `setUser`)
- Hooks: useParams, useState, useEffect
- Effect `useEffect` L10: mount+update+unmount (deps [userId]) → fetchUser, setUser
- API CALL `fetchUser()` via service in useEffect L10 (line 12)
- Libraries: react-router-dom#Link
- Used by: nothing (unused or entry point)
- Pages: /users/:userId
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".

## UserEdit
`src/pages/users/UserEdit.jsx:7` · function · default export · simple

Edit page, lazy-loaded by the router.

- State: `user` (useState, init `null`, set via `setUser`)
- Hooks: useParams, useNavigate, useState, useEffect
- Effect `useEffect` L12: mount+update+unmount (deps [userId]) → fetchUser; cleanup → controller.abort
- Handler `async handleSave(values)` L18 → updateUser, navigate
- API CALL `fetchUser()` via service in useEffect L12 (line 14)
- API CALL `updateUser()` via service in handler handleSave (line 19)
- Renders: UserForm(initial, onSubmit, submitLabel)
- Used by: nothing (unused or entry point)
- Pages: /users/:userId/edit
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".

## UsersPage
`src/pages/users/UsersPage.jsx:7` · function · default export · simple

User list with search and multi-select.

- Hooks: useSelector, useDispatch, useEffect
- Effect `useEffect` L11: mount+update+unmount (deps [dispatch, query]) → setTimeout, dispatch, loadUsers; cleanup → clearTimeout
- Timer `setTimeout` in useEffect L11 (line 12): released
- Reads redux:users `users` via useSelector
- Writes redux:users: `loadUsers` via dispatch in useEffect L11
- Writes redux:users: `setQuery` via dispatch in inline callback
- Writes redux:users: `toggleSelected` via dispatch in inline callback
- CSS classes: table (src/styles.css:4)
- Libraries: react-router-dom#Link
- Used by: nothing (unused or entry point)
- Pages: /users
- Impact: changing the props/export affects 0 component(s) and 1 page(s); update every caller listed under "Used by".

## UserForm
`src/pages/users/UserForm.jsx:11` · function · default export · moderate

Controlled user form validated with yup.

- Props: `submitLabel?: unknown` = `'Save'`, `initial?: unknown`, `onSubmit?: unknown`
- State: `values` (useState, init `initial`, set via `setValues`); `errors` (useState, init `{}`, set via `setErrors`)
- Hooks: useState×2
- Props from ProfileSettings: initial={ name: '', email: '', role: 'admin' }, onSubmit=save
- Props from UserEdit: initial=user, onSubmit=handleSave, submitLabel="Update user"
- Handler `handleChange(e)` L15 sets values → setValues
- Handler `async handleSubmit(e)` L17 sets errors → e.preventDefault, userSchema.validate, setErrors, onSubmit, Object.fromEntries
- Validation (yup): userSchema [name, email, role]
- Validation (html): name [required]
- Validation (html): email [required, type=email]
- CSS classes: form-row (src/styles.css:5), form-error (src/styles.css:6)
- Used by: ProfileSettings, UserEdit
- Pages: /users/:userId/edit, /settings, /settings/profile
- Impact: changing the props/export affects 2 component(s) and 3 page(s); update every caller listed under "Used by".
