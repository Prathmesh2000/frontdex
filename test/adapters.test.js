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

test('Svelte 5 runes and Svelte 4 components, SvelteKit routes, layouts and endpoints', () => {
  const cat = scanFixture({ svelte: '5', '@sveltejs/kit': '2' }, {
    'src/routes/+layout.svelte': '<script>\n  let { children } = $props();\n</script>\n<nav class="top">Shop</nav>\n{@render children()}\n',
    'src/routes/+page.svelte': [
      '<script lang="ts">',
      "  import Counter from '$lib/Counter.svelte';",
      "  import Legacy from '$lib/Legacy.svelte';",
      '</script>',
      '<main class="home">',
      '  {#if true}<Counter label="Clicks" step={2} onchange={() => {}} />{/if}',
      '  <Legacy title="old" on:close={() => {}} />',
      '</main>',
    ].join('\n'),
    'src/routes/products/[id]/+page.svelte': '<h1>Product</h1>\n',
    'src/routes/(shop)/cart/+page.svelte': '<h1>Cart</h1>\n',
    'src/routes/api/items/+server.ts': 'export function GET() { return new Response("[]"); }\nexport function POST() { return new Response(null, { status: 201 }); }\n',
    'src/routes/login/+page.svelte': '<form method="POST"></form>\n',
    'src/routes/login/+page.server.ts': 'export const actions = { default: async () => ({ ok: true }) };\n',
    'src/lib/Counter.svelte': [
      '<script lang="ts">',
      "  let { label, step = 1 }: { label: string; step?: number } = $props();",
      '  let count = $state(0);',
      '  let doubled = $derived(count * 2);',
      '  $effect(() => {',
      '    const id = setInterval(() => count++, 1000);',
      '    return () => clearInterval(id);',
      '  });',
      "  async function load() { await fetch('/api/items'); }",
      '</script>',
      '<button class="counter" onclick={() => (count += step)}>{label}: {count} ({doubled})</button>',
    ].join('\n'),
    'src/lib/Legacy.svelte': [
      '<script>',
      "  import { onMount, onDestroy } from 'svelte';",
      '  export let title;',
      "  export let tone = 'info';",
      '  let open = false;',
      '  $: upper = title.toUpperCase();',
      '  onMount(() => {});',
      '  onDestroy(() => {});',
      '</script>',
      '<div class="legacy {tone}">{upper}</div>',
    ].join('\n'),
    // No tsconfig `paths`: $lib resolves through SvelteKit's src/lib convention.
    'svelte.config.js': 'export default { kit: {} };\n',
  });
  const C = cat.components;
  assert.deepEqual(C.Counter.props, { label: { type: 'string', required: true }, step: { type: 'number', required: false, default: '1' } });
  assert.deepEqual(Object.fromEntries(Object.entries(C.Counter.state).map(([k, v]) => [k, v.source])), { count: '$state', doubled: 'computed' });
  assert.deepEqual(C.Counter.lifecycle[0].phases, ['mount', 'update', 'unmount']);
  assert.equal(C.Counter.apiCalls[0].target, '/api/items');
  assert.deepEqual(C.Legacy.props, { title: { type: 'unknown', required: true }, tone: { type: 'unknown', required: false, default: "'info'" } });
  assert.equal(C.Legacy.state.open.source, 'let');
  assert.deepEqual(C.Legacy.lifecycle.map((e) => e.via), ['$:', 'onMount', 'onDestroy']);
  assert.deepEqual(C.HomePage.renders.sort(), ['Counter', 'Legacy']);
  assert.deepEqual(C.HomePage.passes.Counter.map((p) => p.name), ['label', 'step', 'onchange']);
  assert.deepEqual(C.HomePage.passes.Legacy.map((p) => p.name), ['title', 'on:close']);
  assert.deepEqual(Object.keys(cat.pages).sort(), ['/', '/cart', '/login', '/products/[id]']);
  assert.deepEqual(cat.pages['/products/[id]'].layouts, ['RootLayout']);
  assert.equal(cat.pages['/'].router, 'sveltekit');
  assert.deepEqual(cat.endpoints['/api/items'].methods, ['GET', 'POST']);
  assert.equal(cat.endpoints['action:/login'].kind, 'server-action');
});

test('Astro: frontmatter props and fetches, child components and framework islands, pages and endpoints', () => {
  const cat = scanFixture({ astro: '5', react: '19' }, {
    'src/layouts/Base.astro': '---\ninterface Props { title: string }\nconst { title } = Astro.props;\n---\n<html><head><title>{title}</title></head><body class="site"><slot /></body></html>\n',
    'src/components/Card.astro': '---\ninterface Props { post: { title: string }; featured?: boolean }\nconst { post, featured = false } = Astro.props;\n---\n<article class="card">{post.title}</article>\n',
    'src/components/Counter.tsx': "import { useState } from 'react';\nexport default function Counter({ start }: { start: number }) { const [n, setN] = useState(start); return <button onClick={() => setN(n + 1)}>{n}</button>; }\n",
    'src/pages/index.astro': [
      '---',
      "import Base from '../layouts/Base.astro';",
      "import Card from '../components/Card.astro';",
      "import Counter from '../components/Counter.tsx';",
      "const posts = await fetch('https://api.example.com/posts').then((r) => r.json());",
      '---',
      '<Base title="Home">',
      '  {posts.map((p) => <Card post={p} featured />)}',
      '  <Counter client:load start={1} />',
      '</Base>',
    ].join('\n'),
    'src/pages/blog/[slug].astro': '<h1>Post</h1>\n',
    'src/pages/_draft.astro': '<p>hidden</p>\n',
    'src/pages/api/search.ts': 'export function GET() { return new Response("[]"); }\n',
  });
  const C = cat.components;
  assert.deepEqual(C.Card.props, { post: { type: '{ title: string }', required: true }, featured: { type: 'boolean', required: false, default: 'false' } });
  assert.deepEqual(C.BaseLayout.props, { title: { type: 'string', required: true } });
  assert.deepEqual(C.HomePage.renders.sort(), ['BaseLayout', 'Card', 'Counter']);
  assert.deepEqual(C.HomePage.passes.Counter.map((p) => p.name), ['client:load', 'start']);
  assert.equal(C.HomePage.apiCalls[0].target, 'https://api.example.com/posts');
  assert.ok(C.Counter.state.n, 'the React island is scanned by the JSX scanner as usual');
  assert.deepEqual(Object.keys(cat.pages).sort(), ['/', '/blog/[slug]']);
  assert.equal(cat.pages['/'].router, 'astro');
  assert.deepEqual(cat.endpoints['/api/search'].methods, ['GET']);
});
