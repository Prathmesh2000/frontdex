import { createRequire } from 'node:module';
import path from 'node:path';
import { parse as babelParse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { memberText } from '../component.js';
import { deriveName, parseFile } from '../parse-file.js';

/*
 * Vue single-file components. The SFC compiler comes from the project's own `vue` package (vue/compiler-sfc), so frontdex
 * adds no dependency and always parses with the Vue version the app uses. Output has the same shape as parseFile():
 * imports/exports from the <script> blocks, and one component per file built from <script setup> / Options API and the
 * <template>. React-specific diagnostics (render loops, hook deps) do not apply and are not run.
 */

const traverse = _traverse.default ?? _traverse;
const ownRequire = createRequire(import.meta.url);
const compilerByDir = new Map();

function loadCompiler(file) {
  const dir = path.dirname(file);
  if (!compilerByDir.has(dir)) {
    let sfc = null;
    for (const req of [createRequire(file), ownRequire]) {
      try {
        sfc = req('vue/compiler-sfc');
        break;
      } catch {}
    }
    compilerByDir.set(dir, sfc);
  }
  return compilerByDir.get(dir);
}

const STATE_CALLS = { ref: 'ref', shallowRef: 'ref', reactive: 'reactive', shallowReactive: 'reactive', computed: 'computed' };
const LIFECYCLE = { onBeforeMount: 'mount', onMounted: 'mount', onBeforeUpdate: 'update', onUpdated: 'update', onBeforeUnmount: 'unmount', onUnmounted: 'unmount', onErrorCaptured: 'error', watch: 'update', watchEffect: 'update' };
const OPTION_LIFECYCLE = { beforeMount: 'mount', mounted: 'mount', beforeUpdate: 'update', updated: 'update', beforeUnmount: 'unmount', unmounted: 'unmount', errorCaptured: 'error' };
const DATA_COMPOSABLES = /^use(Lazy)?(Fetch|AsyncData)$|^useQuery$|^useSWRV$/;
const ROUTER_COMPOSABLES = /^use(Route|Router)$/;
// Built-ins and router/Nuxt components that are not project components.
const BUILTIN = /^(Transition|TransitionGroup|KeepAlive|Teleport|Suspense|Component|RouterView|RouterLink|NuxtLink|NuxtPage|NuxtLayout|ClientOnly|Slot|Template)$/;

const pascal = (s) => s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
const snippet = (code, node, max = 40) => {
  const s = code.slice(node.start, node.end).replace(/\s+/g, ' ');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

export function parseVue(file, code) {
  const sfc = loadCompiler(file);
  const empty = { file, imports: new Map(), exports: new Map(), reexports: [], exportAll: [], aliases: new Map(), components: [], routes: [], typeImports: [] };
  if (!sfc) return { ...empty, error: 'vue/compiler-sfc not found: install vue in the project to scan .vue files' };
  const { descriptor, errors } = sfc.parse(code, { filename: file });
  if (errors?.length && !descriptor.template && !descriptor.scriptSetup && !descriptor.script) return { ...empty, error: String(errors[0].message ?? errors[0]) };

  // Module facts (imports, exports, stores, schemas) from each <script> block, line numbers kept.
  const blocks = [descriptor.script, descriptor.scriptSetup].filter(Boolean);
  const mod = empty;
  for (const block of blocks) {
    const ext = { ts: '.ts', tsx: '.tsx', jsx: '.jsx' }[block.lang] ?? '.js';
    const part = parseFile(file, block.content, { syntaxFile: file + ext, startLine: block.loc.start.line });
    if (part.error) mod.error = part.error;
    for (const k of ['imports', 'exports', 'aliases']) for (const [a, b] of part[k]) mod[k].set(a, b);
    for (const k of ['reexports', 'exportAll', 'routes', 'typeImports']) mod[k].push(...(part[k] ?? []));
    for (const k of ['stores', 'thunks', 'schemas', 'customHooks', 'styleImports', 'unusedImports']) if (part[k]) mod[k] = Array.isArray(part[k]) ? [...(mod[k] ?? []), ...part[k]] : { ...mod[k], ...part[k] };
  }

  // Same naming as JSX files (pages/products/[id].vue → ProductsIdPage); Nuxt layouts/default.vue → DefaultLayout.
  const name = path.basename(path.dirname(file)) === 'layouts' ? `${pascal(path.basename(file, '.vue'))}Layout` : deriveName(file);
  const record = { name, kind: 'function', line: 1, props: {}, state: {}, context: [], refs: [], hooks: new Map(), lifecycle: [], jsx: [], apiCalls: [] };
  const registered = new Map();
  for (const block of blocks) scanScript(block, record, registered, mod);
  if (descriptor.template?.ast) scanTemplate(descriptor.template.ast, record, registered);

  record.hooks = [...record.hooks].map(([name, count]) => ({ name, category: DATA_COMPOSABLES.test(name) ? 'data' : ROUTER_COMPOSABLES.test(name) ? 'router' : 'custom', ...(count > 1 && { count }) }));
  mod.exports.set('default', record.name);
  mod.components = [record];
  return mod;
}

/** <script setup> macros and composables, or the Options API object of `export default {}` / defineComponent({}). */
function scanScript(block, record, registered, mod) {
  const code = block.content;
  let ast;
  try {
    ast = babelParse(code, { sourceType: 'module', plugins: ['typescript', 'jsx', 'decorators-legacy'], errorRecovery: true, startLine: block.loc.start.line });
  } catch {
    return;
  }
  const typeDecls = new Map();
  for (const stmt of ast.program.body) {
    const d = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (d?.type === 'TSInterfaceDeclaration') typeDecls.set(d.id.name, d.body.body);
    if (d?.type === 'TSTypeAliasDeclaration' && d.typeAnnotation.type === 'TSTypeLiteral') typeDecls.set(d.id.name, d.typeAnnotation.members);
  }
  const text = (node, max) => snippet(code, { start: node.start - ast.program.start, end: node.end - ast.program.start }, max);

  traverse(ast, {
    CallExpression(p) {
      const name = memberText(p.node.callee);
      if (!name) return;
      const line = p.node.loc?.start.line;
      if (name === 'defineProps') {
        const typeArg = (p.node.typeParameters ?? p.node.typeArguments)?.params?.[0];
        const members = typeArg?.type === 'TSTypeLiteral' ? typeArg.members : typeArg?.type === 'TSTypeReference' ? typeDecls.get(typeArg.typeName.name) : null;
        if (members) {
          for (const m of members) {
            if (m.type !== 'TSPropertySignature' || !m.key.name) continue;
            record.props[m.key.name] = { type: m.typeAnnotation ? text(m.typeAnnotation.typeAnnotation, 60) : 'unknown', required: !m.optional };
          }
        } else if (p.node.arguments[0]) runtimeProps(p.node.arguments[0], record, text);
        // withDefaults(defineProps<T>(), { size: 'md' })
        const parent = p.parentPath.node;
        if (parent.type === 'CallExpression' && memberText(parent.callee) === 'withDefaults' && parent.arguments[1]?.type === 'ObjectExpression') {
          for (const prop of parent.arguments[1].properties) {
            const key = prop.key?.name ?? prop.key?.value;
            if (record.props[key]) record.props[key].default = text(prop.value, 40);
          }
        }
        return;
      }
      if (STATE_CALLS[name]) {
        const decl = p.parentPath.isVariableDeclarator() ? p.parentPath.node.id : null;
        if (decl?.type === 'Identifier') record.state[decl.name] = { source: STATE_CALLS[name], ...(p.node.arguments[0] && name !== 'computed' && { initial: text(p.node.arguments[0], 40) }) };
        return;
      }
      if (LIFECYCLE[name]) {
        const fn = p.node.arguments.find((a) => a.type.includes('Function'));
        const calls = new Set();
        if (fn) {
          p.traverse({
            CallExpression(q) {
              const callee = memberText(q.node.callee);
              if (callee) calls.add(callee);
            },
          });
        }
        const deps = name === 'watch' && p.node.arguments[0] ? [text(p.node.arguments[0], 40)] : undefined;
        record.lifecycle.push({ via: name, phases: [LIFECYCLE[name]], ...(deps && { deps }), ...(calls.size && { calls: [...calls].slice(0, 12) }), ...(line && { line }) });
        return;
      }
      if (name === 'defineOptions' && p.node.arguments[0]?.type === 'ObjectExpression') {
        const n = p.node.arguments[0].properties.find((x) => x.key?.name === 'name' && x.value.type === 'StringLiteral');
        if (n) record.name = n.value.value;
        return;
      }
      if (/^use[A-Z]/.test(name)) record.hooks.set(name, (record.hooks.get(name) ?? 0) + 1);
      const api = apiCall(name, p.node, text);
      if (api) record.apiCalls.push({ ...api, in: enclosingName(p) ?? 'setup', ...(line && { line }) });
    },
    ExportDefaultDeclaration(p) {
      let obj = p.node.declaration;
      if (obj.type === 'CallExpression' && memberText(obj.callee) === 'defineComponent') obj = obj.arguments[0];
      if (obj?.type === 'ObjectExpression') optionsApi(obj, record, registered, text);
    },
  });
}

function enclosingName(p) {
  const fn = p.getFunctionParent();
  if (!fn) return null;
  if (fn.node.id?.name) return fn.node.id.name;
  if (fn.parentPath.isVariableDeclarator()) return fn.parentPath.node.id.name;
  const call = fn.parentPath.isCallExpression() ? memberText(fn.parentPath.node.callee) : null;
  return call ?? null;
}

/** fetch / $fetch / useFetch-style composables / axios-like `client.get('/x')`. */
function apiCall(name, node, text) {
  const target = node.arguments[0]?.type === 'StringLiteral' ? node.arguments[0].value : node.arguments[0]?.type === 'TemplateLiteral' ? text(node.arguments[0], 60) : undefined;
  if (name === 'fetch' || name === '$fetch') return { via: name, method: 'GET', ...(target && { target }) };
  if (DATA_COMPOSABLES.test(name)) return { via: name, method: 'GET', ...(target && { target }) };
  const m = /^(axios|api|http|client|\$axios)\.(get|post|put|patch|delete)$/i.exec(name);
  if (m) return { via: name, method: m[2].toUpperCase(), ...(target && { target }) };
  return null;
}

function runtimeProps(arg, record, text) {
  if (arg.type === 'ArrayExpression') {
    for (const el of arg.elements) if (el?.type === 'StringLiteral') record.props[el.value] = { type: 'unknown', required: false };
    return;
  }
  if (arg.type !== 'ObjectExpression') return;
  for (const prop of arg.properties) {
    const key = prop.key?.name ?? prop.key?.value;
    if (!key) continue;
    const v = prop.value;
    if (v.type === 'ObjectExpression') {
      const field = (n) => v.properties.find((x) => (x.key?.name ?? x.key?.value) === n)?.value;
      const type = field('type');
      const def = field('default');
      record.props[key] = { type: type ? text(type, 40) : 'unknown', required: field('required')?.value === true, ...(def && { default: text(def, 40) }) };
    } else record.props[key] = { type: text(v, 40), required: false };
  }
}

function optionsApi(obj, record, registered, text) {
  for (const prop of obj.properties) {
    const key = prop.key?.name ?? prop.key?.value;
    if (key === 'name' && prop.value?.type === 'StringLiteral') record.name = prop.value.value;
    else if (key === 'props' && prop.value) runtimeProps(prop.value, record, text);
    else if (key === 'components' && prop.value?.type === 'ObjectExpression') {
      for (const c of prop.value.properties) if (c.value?.type === 'Identifier') registered.set(c.key.name ?? c.key.value, c.value.name);
    } else if (key === 'data') {
      const fn = prop.type === 'ObjectMethod' ? prop : prop.value;
      const ret = fn?.body?.type === 'ObjectExpression' ? fn.body : fn?.body?.body?.find((s) => s.type === 'ReturnStatement')?.argument;
      if (ret?.type === 'ObjectExpression') for (const d of ret.properties) if (d.key) record.state[d.key.name ?? d.key.value] = { source: 'data', initial: text(d.value, 40) };
    } else if (OPTION_LIFECYCLE[key]) record.lifecycle.push({ via: key, phases: [OPTION_LIFECYCLE[key]], ...(prop.loc && { line: prop.loc.start.line }) });
  }
}

/** Components used in <template>, the props/listeners passed to them, and static classes. */
function scanTemplate(root, record, registered) {
  const classes = new Set();
  const walk = (node) => {
    if (node.type === 1) {
      for (const a of node.props) if (a.type === 6 && a.name === 'class' && a.value) a.value.content.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      // tagType 1 = component (PascalCase, kebab-case custom tags, or anything not a native element).
      if (node.tagType === 1) {
        const tag = registered.get(node.tag) ?? registered.get(pascal(node.tag)) ?? (node.tag.includes('.') ? node.tag : pascal(node.tag));
        if (!BUILTIN.test(tag)) {
          const props = node.props.flatMap((a) => {
            if (a.type === 6) return [{ name: a.name, value: a.value ? JSON.stringify(a.value.content) : 'true' }];
            if (a.type === 7 && a.name === 'bind' && a.arg?.content) return [{ name: a.arg.content, value: a.exp?.content ?? 'true' }];
            if (a.type === 7 && a.name === 'on' && a.arg?.content) return [{ name: `@${a.arg.content}`, value: a.exp?.content ?? '' }];
            if (a.type === 7 && a.name === 'model') return [{ name: `v-model${a.arg?.content ? `:${a.arg.content}` : ''}`, value: a.exp?.content ?? '' }];
            return [];
          });
          record.jsx.push({ name: tag, line: node.loc.start.line, props });
        }
      }
    }
    for (const child of node.children ?? []) walk(child);
    for (const b of node.branches ?? []) walk(b);
  };
  walk(root);
  if (classes.size) record.styles = { classes: [...classes] };
}
