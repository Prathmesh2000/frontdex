import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scanProject, validateCatalogue, mergeManual } from '../src/index.js';

const example = (name) => scanProject(loadConfig(path.resolve(import.meta.dirname, '../examples', name))).catalogue;
const shop = example('next-app');
const admin = example('react-app');
const C = shop.components;
const issuesOf = (id, type) => (C[id].issues ?? []).filter((i) => !type || i.type === type);

test('generated documents are valid CatalogueSpec 1.1', () => {
  for (const cat of [shop, admin]) {
    assert.equal(cat.catalogue, '1.1');
    assert.deepEqual(validateCatalogue(cat), { valid: true, errors: [] });
  }
});

test('Next app router: groups, dynamic + catch-all segments, nested layouts', () => {
  assert.equal(Object.keys(shop.pages).length, 13);
  assert.deepEqual(shop.pages['/admin/orders'].layouts, ['RootLayout', 'AdminLayout']);
  assert.deepEqual(shop.pages['/admin/products/[...slug]'].params, ['slug']);
  assert.deepEqual(shop.pages['/blog/[[...slug]]'].params, ['slug']);
  assert.equal(shop.pages['/checkout/success'].component, 'SuccessPage');
});

test('React Router objects: layout routes, index routes, wrapped elements, errorElement', () => {
  assert.deepEqual(Object.keys(admin.pages).sort(), ['/', '/settings', '/settings/billing', '/settings/profile', '/settings/security', '/users', '/users/:userId', '/users/:userId/edit']);
  assert.equal(admin.pages['/'].component, 'Dashboard');
  assert.deepEqual(admin.pages['/settings/billing'].layouts, ['AppShell', 'SettingsLayout']);
  assert.equal(admin.pages['/users/:userId/edit'].component, 'UserEdit');
  assert.ok(admin.pages['/users/:userId/edit'].components.includes('ErrorScreen'));
});

test('component kinds, compound components and name collisions', () => {
  assert.equal(C.ProductCard.kind, 'memo');
  assert.equal(C.Button.kind, 'forwardRef');
  assert.equal(C.CartBadge.kind, 'class');
  assert.deepEqual(C.FeaturedCollections.renders.slice(0, 4), ['TabsRoot', 'TabsList', 'TabsTrigger', 'TabsPanel']);
  assert.ok(C.StatCard.renders.includes('CardHeader') && C.StatCard.renders.includes('Card@src/features/admin/Card.tsx'));
});

test('memory leaks: uncleared resources are flagged, cleaned ones are not', () => {
  assert.equal(issuesOf('HeroBanner', 'memory-leak')[0].severity, 'high');
  assert.match(issuesOf('AuthProvider', 'memory-leak')[0].message, /onAuthStateChanged/);
  assert.equal(issuesOf('LiveVisitors', 'memory-leak').length, 2);
  assert.equal(issuesOf('SalesPanel', 'memory-leak').length, 1);
  assert.deepEqual(C.Modal.timers.map((t) => t.cleared), [true]);
  assert.deepEqual(C.PaymentForm.timers.map((t) => [t.type, t.cleared]), [['interval', true]]);
  assert.equal(C.ProductGrid.timers[0].type, 'observer');
  assert.equal(issuesOf('Modal').length, 0);
});

test('render loops, unsafe async updates and stale dependencies', () => {
  assert.equal(issuesOf('AdminSidebar', 'render-loop').length, 1);
  assert.equal(issuesOf('Reviews', 'unsafe-async-update').length, 1);
  assert.match(issuesOf('RelatedProducts', 'missing-dependency')[0].message, /excludeId/);
});

test('global state: redux slices, connect(), contexts via custom hooks, zustand', () => {
  const s = shop.stores;
  assert.deepEqual(s['redux:cart'].actions, ['addItem', 'removeItem', 'updateQuantity', 'applyCoupon', 'clearCart']);
  assert.ok(s['redux:cart'].readers.includes('CartBadge') && s['redux:cart'].writers.includes('CartBadge'));
  assert.ok(s['redux:cart'].writers.includes('CheckoutWizard'));
  assert.deepEqual(s['context:AuthContext'].providers, ['AuthProvider']);
  assert.ok(s['context:AuthContext'].readers.includes('Header'));
  assert.deepEqual(s['zustand:useSearchStore'].readers, ['SearchBar']);
  assert.deepEqual(admin.components.SelectionBar.store.writes.map((w) => w.action), ['clearSelection']);
});

test('API calls: fetch, axios instance, useSWR, service functions', () => {
  assert.deepEqual(C.OrderEditor.apiCalls.map((a) => `${a.method} ${a.target} ${a.in}`), ['PATCH /orders/${order.id} handler handleSave', 'DELETE /orders/${order.id} handler handleDelete']);
  assert.equal(C.ProductGrid.apiCalls[0].via, 'useSWR');
  assert.ok(C.Reviews.apiCalls.some((a) => a.via === 'fetch'));
});

test('validation: zod across files, react-hook-form, html rules, custom, yup', () => {
  assert.deepEqual(C.AddressForm.validation.find((v) => v.via === 'zod'), { via: 'zod', schema: 'addressSchema', line: 23, rules: ['name', 'street', 'city', 'zip', 'country'] });
  assert.ok(C.LoginForm.validation.some((v) => v.via === 'react-hook-form' && v.field === 'password' && v.rules.includes('minLength')));
  assert.ok(C.PaymentForm.validation.some((v) => v.via === 'custom' && v.fn === 'validateCard'));
  assert.equal(admin.components.UserForm.validation[0].via, 'yup');
});

test('styles: CSS module classes and global classes resolve to file:line', () => {
  const mod = C.ProductCard.styles.modules[0];
  assert.equal(mod.file, 'src/features/products/ProductCard.module.css');
  assert.equal(mod.classes.find((c) => c.name === 'card').at, 'src/features/products/ProductCard.module.css:1');
  assert.match(C.ProductCard.styles.classes.find((c) => c.name === 'btn').at, /^app\/globals\.css:\d+$/);
});

test('data flow: props passed to children with values', () => {
  assert.deepEqual(C.CheckoutWizard.passes.OrderSummary.map((p) => `${p.name}=${p.value}`), ['lines=items', 'coupon=coupon', 'readOnly=state.step === 2']);
});

test('dead code: unused components, files, exports, imports, variables, props', () => {
  const h = shop.health;
  assert.deepEqual(h.unusedComponents, ['OldPromoBanner']);
  assert.ok(h.unusedFiles.includes('src/components/layout/OldPromoBanner.tsx'));
  assert.ok(h.unusedExports.some((e) => e.name === 'formatLegacyPrice'));
  assert.deepEqual(h.unusedImports.map((u) => u.name), ['Badge']);
  assert.equal(issuesOf('CheckoutWizard', 'unused-prop')[0].message, 'prop `userEmail` is destructured but never used');
  assert.ok(issuesOf('OrderEditor', 'unused-variable').some((i) => /unusedDraftNote/.test(i.message)));
  assert.equal(issuesOf('BlogPage', 'deprecated-usage').length, 1);
});

test('regeneration keeps human-owned fields', () => {
  const prev = structuredClone(shop);
  prev.info.description = 'Storefront';
  prev.components.Header.tags = ['layout'];
  prev.components.Header.owner = 'web-core';
  prev.components.Header['x-figma'] = 'https://figma.com/x';
  prev.pages['/'].description = 'Landing';
  const merged = mergeManual(structuredClone(shop), prev);
  assert.equal(merged.info.description, 'Storefront');
  assert.deepEqual(merged.components.Header.tags, ['layout']);
  assert.equal(merged.components.Header.owner, 'web-core');
  assert.equal(merged.components.Header['x-figma'], 'https://figma.com/x');
  assert.equal(merged.pages['/'].description, 'Landing');
});
