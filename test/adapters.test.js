import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig, scanProject, validateCatalogue } from '../src/index.js';

/** Writes a throwaway project ({ 'path': 'content' }) and scans it. */
function scanFixture(deps, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapters-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: deps }));
  for (const [rel, code] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), code);
  }
  const result = scanProject(loadConfig(dir));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(validateCatalogue(result.catalogue), { valid: true, errors: [] });
  return result.catalogue;
}

test('Vue SFCs: script setup macros, Options API, template children, Vue Router objects', () => {
  const cat = scanFixture({ vue: '3', 'vue-router': '4' }, {
    'src/App.vue': '<template><RouterView /></template>\n',
    'src/router/index.ts': [
      "import { createRouter, createWebHistory } from 'vue-router';",
      "import Home from '../views/Home.vue';",
      "import Shell from '../views/Shell.vue';",
      'export default createRouter({ history: createWebHistory(), routes: [',
      "  { path: '/', component: Home },",
      "  { path: '/shop', component: Shell, children: [{ path: 'products', component: () => import('../views/Products.vue') }] },",
      '] });',
    ].join('\n'),
    'src/views/Home.vue': '<template><h1 class="title hero">Home</h1></template>\n',
    'src/views/Shell.vue': '<template><main><RouterView /></main></template>\n',
    'src/views/Products.vue': [
      '<script setup lang="ts">',
      "import { ref, onMounted, onUnmounted } from 'vue';",
      "import ProductCard from '../components/ProductCard.vue';",
      "import { useCart } from '../composables/useCart';",
      'const items = ref<string[]>([]);',
      'const { add } = useCart();',
      "onMounted(async () => { items.value = await fetch('/api/products').then((r) => r.json()); });",
      'onUnmounted(() => console.log("bye"));',
      '</script>',
      '<template>',
      '  <section class="grid">',
      '    <product-card v-for="item in items" :key="item" :title="item" size="lg" @select="add" />',
      '  </section>',
      '</template>',
    ].join('\n'),
    'src/components/ProductCard.vue': [
      '<script setup lang="ts">',
      'interface Props { title: string; size?: "sm" | "lg" }',
      "const props = withDefaults(defineProps<Props>(), { size: 'sm' });",
      "const emit = defineEmits<{ select: [title: string] }>();",
      '</script>',
      '<template><button class="card" @click="emit(\'select\', props.title)">{{ title }}</button></template>',
    ].join('\n'),
    'src/components/LegacyCounter.vue': [
      '<script>',
      "import ProductCard from './ProductCard.vue';",
      'export default {',
      "  name: 'LegacyCounter',",
      '  components: { ProductCard },',
      '  props: { start: { type: Number, default: 0, required: true } },',
      '  data() { return { count: 0 }; },',
      '  mounted() {},',
      '};',
      '</script>',
      '<template><ProductCard title="x" /></template>',
    ].join('\n'),
    'src/composables/useCart.ts': 'export function useCart() { return { add: (x: string) => x }; }\n',
  });
  const C = cat.components;
  assert.deepEqual(C.ProductCard.props, { title: { type: 'string', required: true }, size: { type: '"sm" | "lg"', required: false, default: "'sm'" } });
  assert.deepEqual(C.ProductCard.usedBy.sort(), ['LegacyCounter', 'Products']);
  assert.deepEqual(C.Products.renders, ['ProductCard']);
  assert.deepEqual(C.Products.passes.ProductCard.map((p) => p.name), ['key', 'title', 'size', '@select']);
  assert.equal(C.Products.state.items.source, 'ref');
  assert.deepEqual(C.Products.lifecycle.map((e) => `${e.via}:${e.phases}`), ['onMounted:mount', 'onUnmounted:unmount']);
  assert.equal(C.Products.apiCalls[0].target, '/api/products');
  assert.deepEqual(C.Products.hooks, [{ name: 'useCart', category: 'custom' }]);
  assert.deepEqual(C.LegacyCounter.props.start, { type: 'Number', required: true, default: '0' });
  assert.equal(C.LegacyCounter.state.count.source, 'data');
  assert.deepEqual(C.Home.styles.classes.map((c) => c.name), ['title', 'hero']);
  assert.equal(cat.pages['/'].router, 'vue-router');
  assert.equal(cat.pages['/shop/products'].component, 'Products');
  assert.deepEqual(cat.pages['/shop/products'].layouts, ['Shell']);
});

test('Nuxt pages, nested routes and the default layout', () => {
  const sfc = (body) => `<template>${body}</template>\n`;
  const cat = scanFixture({ nuxt: '3', vue: '3' }, {
    'app.vue': sfc('<NuxtLayout><NuxtPage /></NuxtLayout>'),
    'layouts/default.vue': sfc('<div><slot /></div>'),
    'pages/index.vue': sfc('<h1>Home</h1>'),
    'pages/products/[id].vue': sfc('<h1>Product</h1>'),
    'pages/account.vue': sfc('<div><NuxtPage /></div>'),
    'pages/account/index.vue': sfc('<p>Overview</p>'),
    'pages/account/orders.vue': sfc('<p>Orders</p>'),
  });
  const summary = Object.fromEntries(Object.entries(cat.pages).map(([r, p]) => [r, [p.router, p.component, ...(p.layouts ?? [])].join(' ')]));
  assert.deepEqual(summary, {
    '/': 'nuxt HomePage App DefaultLayout',
    '/account': 'nuxt AccountPage App DefaultLayout Account',
    '/account/orders': 'nuxt Orders App DefaultLayout Account',
    '/products/[id]': 'nuxt ProductsIdPage App DefaultLayout',
  });
});
