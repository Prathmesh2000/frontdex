import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, mergeManual, scanProject, validateCatalogue } from '../src/index.js';

const example = (name) => scanProject(loadConfig(path.resolve(import.meta.dirname, '../examples', name))).catalogue;
const next = example('next-app');
const spa = example('react-app');

test('generated documents are valid CatalogueSpec', () => {
  for (const cat of [next, spa]) assert.deepEqual(validateCatalogue(cat), { valid: true, errors: [] });
});

test('function component: state, refs, effect with cleanup', () => {
  const h = next.components.Header;
  assert.equal(h.description, 'Top navigation bar. Becomes compact after scrolling.');
  assert.deepEqual(Object.keys(h.state), ['menuOpen', 'scrolled']);
  assert.equal(h.state.scrolled.type, 'boolean');
  assert.deepEqual(h.refs, ['navRef']);
  assert.deepEqual(h.lifecycle[0].phases, ['mount', 'unmount']);
  assert.deepEqual(h.lifecycle[0].cleanup, ['window.removeEventListener']);
  assert.deepEqual(h.externals, ['next/link#Link']);
});

test('effect deps map to update phase', () => {
  const e = next.components.ProductGrid.lifecycle[0];
  assert.deepEqual(e.deps, ['category', 'pageSize']);
  assert.deepEqual(e.phases, ['mount', 'update', 'unmount']);
  assert.ok(e.calls.includes('setProducts'));
});

test('props from TS interface with extends, JSDoc and defaults', () => {
  const p = next.components.ProductCard.props;
  assert.equal(next.components.ProductCard.kind, 'memo');
  assert.deepEqual(p.product, { type: 'Product', required: true, description: 'Product to render' });
  assert.deepEqual(p.compact, { type: 'boolean', required: false, default: 'false' });
  assert.equal(p.className.required, false);
});

test('class component: state, lifecycle, propTypes, contextType', () => {
  const c = next.components.CartBadge;
  assert.equal(c.kind, 'class');
  assert.deepEqual(Object.keys(c.state), ['count', 'pulse']);
  assert.deepEqual(c.props.max, { type: 'number', required: true });
  assert.deepEqual(c.context, ['CartContext']);
  assert.deepEqual(c.lifecycle.map((e) => e.via), ['componentDidMount', 'componentDidUpdate', 'componentWillUnmount']);
});

test('JS propTypes/defaultProps and @deprecated', () => {
  const f = next.components.Footer;
  assert.equal(f.status, 'deprecated');
  assert.deepEqual(f.props.year, { type: 'number', required: false, default: '2026' });
  assert.equal(f.props.links.required, true);
});

test('Next app router: routes, groups, params, layouts, barrel re-exports', () => {
  assert.deepEqual(Object.keys(next.pages), ['/', '/about', '/products/[id]']);
  const page = next.pages['/products/[id]'];
  assert.deepEqual(page.params, ['id']);
  assert.deepEqual(page.layouts, ['RootLayout']);
  assert.ok(page.components.includes('ProductCard'));
  assert.deepEqual(next.components.RootLayout.renders, ['CartProvider', 'Header', 'Footer']);
  assert.deepEqual(next.components.ProductCard.usedBy.sort(), ['ProductGrid', 'ProductsIdPage']);
});

test('React Router: nested routes, layout routes, lazy and namespace imports', () => {
  assert.deepEqual(Object.keys(spa.pages), ['/', '/*', '/users', '/users/:userId']);
  assert.equal(spa.pages['/'].component, 'Dashboard');
  assert.deepEqual(spa.pages['/users/:userId'], {
    router: 'react-router',
    file: 'src/App.jsx',
    component: 'UserDetail',
    params: ['userId'],
    layouts: ['Shell'],
    components: ['Shell', 'UserDetail'],
  });
  assert.equal(spa.components.Chart.kind, 'memo');
  assert.deepEqual(spa.components.Dashboard.lifecycle[0].phases, ['mount', 'update']);
});

test('regeneration keeps human-owned fields', () => {
  const prev = structuredClone(next);
  prev.info.description = 'Storefront';
  prev.components.Header.tags = ['layout'];
  prev.components.Header.owner = 'web-core';
  prev.components.Header['x-figma'] = 'https://figma.com/x';
  prev.components.ProductGrid.props.pageSize.description = 'Items per request';
  prev.pages['/'].description = 'Landing';
  const merged = mergeManual(structuredClone(next), prev);
  assert.equal(merged.info.description, 'Storefront');
  assert.deepEqual(merged.components.Header.tags, ['layout']);
  assert.equal(merged.components.Header.owner, 'web-core');
  assert.equal(merged.components.Header['x-figma'], 'https://figma.com/x');
  assert.equal(merged.components.ProductGrid.props.pageSize.description, 'Items per request');
  assert.equal(merged.pages['/'].description, 'Landing');
});
