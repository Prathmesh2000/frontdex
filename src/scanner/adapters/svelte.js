import path from 'node:path';
import { parse as babelParse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { memberText } from '../component.js';
import { a11yIssues } from '../analyzers/a11y.js';
import { deriveName, parseFile } from '../parse-file.js';
import { apiCall, lineIndex, loadFromProject, mergeScript, snippet } from './common.js';

/*
 * Svelte components (.svelte), parsed with the project's own svelte/compiler. Works with Svelte 5 runes ($props, $state,
 * $derived, $effect) and Svelte 4 (`export let`, top-level `let`, `$:`, onMount/onDestroy). Same output shape as
 * parseFile(); React-specific diagnostics are not run.
 */

const traverse = _traverse.default ?? _traverse;
const LIFECYCLE = { onMount: 'mount', beforeUpdate: 'update', afterUpdate: 'update', onDestroy: 'unmount' };

export function parseSvelte(file, code) {
  const compiler = loadFromProject(file, 'svelte/compiler');
  const mod = { file, imports: new Map(), exports: new Map(), reexports: [], exportAll: [], aliases: new Map(), components: [], routes: [], typeImports: [] };
  if (!compiler) return { ...mod, error: 'svelte/compiler not found: install svelte in the project to scan .svelte files' };
  let ast;
  try {
    ast = compiler.parse(code, { modern: true });
  } catch (err) {
    return { ...mod, error: err.message };
  }
  const lineOf = lineIndex(code);
  // SvelteKit route files: src/routes/products/[id]/+page.svelte → ProductsIdPage, like Next's page.tsx.
  const base = path.basename(file, '.svelte');
  const name = base.startsWith('+') ? deriveName(path.join(path.dirname(file), `${base.slice(1).replace(/@.*$/, '')}.svelte`)) : deriveName(file);
  const record = { name, kind: 'function', line: 1, props: {}, state: {}, context: [], refs: [], hooks: new Map(), lifecycle: [], jsx: [], apiCalls: [] };

  for (const script of [ast.module, ast.instance].filter(Boolean)) {
    const content = code.slice(script.content.start, script.content.end);
    const startLine = lineOf(script.content.start);
    const lang = script.attributes?.find((a) => a.name === 'lang')?.value?.[0]?.data;
    mergeScript(mod, parseFile(file, content, { syntaxFile: `${file}.${lang === 'ts' ? 'ts' : 'js'}`, startLine }));
    if (script === ast.instance) scanInstance(content, startLine, record);
  }
  scanMarkup(ast.fragment, record, lineOf);

  record.hooks = [...record.hooks].map(([hook, count]) => ({ name: hook, category: 'custom', ...(count > 1 && { count }) }));
  mod.exports.set('default', record.name);
  mod.components = [record];
  return mod;
}

function scanInstance(code, startLine, record) {
  let ast;
  try {
    ast = babelParse(code, { sourceType: 'module', plugins: ['typescript'], errorRecovery: true, startLine });
  } catch {
    return;
  }
  const text = (node, max) => snippet(code, node, max);
  // Runes mode: only $state is state; without runes, Svelte 4 makes every top-level `let` reactive.
  const usesRunes = /\$(props|state|derived|effect)\s*[.(]/.test(code);

  for (const stmt of ast.program.body) {
    // Svelte 4: `export let title = 'x'` is a prop; other top-level `let`s are component state.
    const exported = stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration' ? stmt.declaration : null;
    if (exported?.kind === 'let') {
      for (const d of exported.declarations) if (d.id.type === 'Identifier') record.props[d.id.name] = { type: d.id.typeAnnotation ? text(d.id.typeAnnotation.typeAnnotation, 60) : 'unknown', required: !d.init, ...(d.init && { default: text(d.init, 40) }) };
    } else if (!usesRunes && stmt.type === 'VariableDeclaration' && stmt.kind === 'let') {
      for (const d of stmt.declarations) if (d.id.type === 'Identifier') record.state[d.id.name] = { source: 'let', ...(d.init && { initial: text(d.init, 40) }) };
    } else if (stmt.type === 'LabeledStatement' && stmt.label.name === '$') {
      record.lifecycle.push({ via: '$:', phases: ['update'], line: stmt.loc.start.line });
    }
  }

  traverse(ast, {
    CallExpression(p) {
      const name = memberText(p.node.callee);
      if (!name) return;
      const line = p.node.loc?.start.line;
      const decl = p.parentPath.isVariableDeclarator() ? p.parentPath.node.id : null;
      if (name === '$props' && decl?.type === 'ObjectPattern') {
        const typed = decl.typeAnnotation?.typeAnnotation;
        const types = new Map((typed?.type === 'TSTypeLiteral' ? typed.members : []).filter((m) => m.key?.name).map((m) => [m.key.name, m]));
        for (const prop of decl.properties) {
          if (prop.type !== 'ObjectProperty') continue;
          const key = prop.key.name ?? prop.key.value;
          const def = prop.value.type === 'AssignmentPattern' ? prop.value.right : null;
          const t = types.get(key);
          record.props[key] = { type: t?.typeAnnotation ? text(t.typeAnnotation.typeAnnotation, 60) : 'unknown', required: t ? !t.optional && !def : !def, ...(def && { default: text(def, 40) }) };
        }
      } else if ((name === '$state' || name === '$state.raw' || name === '$derived' || name === '$derived.by') && decl?.type === 'Identifier') {
        record.state[decl.name] = { source: name.startsWith('$derived') ? 'computed' : '$state', ...(name.startsWith('$state') && p.node.arguments[0] && { initial: text(p.node.arguments[0], 40) }) };
      } else if (name === '$effect' || name === '$effect.pre' || LIFECYCLE[name]) {
        const fn = p.node.arguments.find((a) => a.type.includes('Function'));
        const returnsCleanup = fn?.body?.type === 'BlockStatement' && fn.body.body.some((s) => s.type === 'ReturnStatement' && s.argument?.type?.includes('Function'));
        const calls = new Set();
        if (fn) {
          p.traverse({
            CallExpression(q) {
              const callee = memberText(q.node.callee);
              if (callee) calls.add(callee);
            },
          });
        }
        const phases = name.startsWith('$effect') ? ['mount', 'update', ...(returnsCleanup ? ['unmount'] : [])] : [LIFECYCLE[name]];
        record.lifecycle.push({ via: name, phases, ...(calls.size && { calls: [...calls].slice(0, 12) }), ...(line && { line }) });
      } else if (!name.startsWith('$')) {
        const api = apiCall(name, p.node, text);
        if (api) record.apiCalls.push({ ...api, in: p.getFunctionParent()?.node.id?.name ?? 'script', ...(line && { line }) });
      }
    },
  });
}

/** Child components with their props/events, and static classes, from the markup. Handles Svelte 5 and 4 node types. */
function scanMarkup(fragment, record, lineOf) {
  const classes = new Set();
  const issues = [];
  const isComponent = (n) => n?.type === 'Component' || n?.type === 'InlineComponent' || n?.type === 'SvelteComponent';
  const visit = (node, inLabel = false) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, inLabel));
    const type = node.type;
    if (isComponent(node)) {
      if (/^[A-Z]/.test(node.name ?? '')) record.jsx.push({ name: node.name, line: lineOf(node.start), props: (node.attributes ?? []).map(attrProp).filter(Boolean) });
    }
    if (type === 'RegularElement' || type === 'Element') {
      const cls = (node.attributes ?? []).find((a) => a.type === 'Attribute' && a.name === 'class');
      const parts = Array.isArray(cls?.value) ? cls.value : [];
      for (const part of parts) if (part.type === 'Text') part.data.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
      // Static attribute values are kept; expressions, events (on:click / onclick) and bindings are present, value unknown.
      const attrs = new Map(
        (node.attributes ?? []).flatMap((a) => {
          if (a.type === 'Attribute') return [[a.name, Array.isArray(a.value) && a.value.length === 1 && a.value[0].type === 'Text' ? a.value[0].data : true]];
          if (a.type === 'OnDirective' || a.type === 'EventHandler') return [[`on:${a.name}`, true]];
          return [];
        }),
      );
      const kids = node.fragment?.nodes ?? node.children ?? [];
      const text = kids.some((k) => (k.type === 'Text' && k.data.trim()) || k.type === 'ExpressionTag' || k.type === 'MustacheTag') ? true : kids.some(isComponent) ? null : false;
      issues.push(...a11yIssues({ tag: node.name, attrs, text, line: lineOf(node.start), inLabel }));
    }
    const childInLabel = inLabel || ((type === 'RegularElement' || type === 'Element') && node.name === 'label');
    for (const key of ['fragment', 'nodes', 'children', 'consequent', 'alternate', 'body', 'fallback', 'pending', 'then', 'catch', 'else']) visit(node[key], childInLabel);
  };
  visit(fragment);
  if (classes.size) record.styles = { classes: [...classes] };
  if (issues.length) record.issues = issues;
}

function attrProp(a) {
  if (a.type === 'Attribute') {
    const v = a.value;
    const value = v === true ? 'true' : Array.isArray(v) && v.length === 1 && v[0].type === 'Text' ? JSON.stringify(v[0].data) : '{…}';
    return { name: a.name, value };
  }
  if (a.type === 'OnDirective' || a.type === 'EventHandler') return { name: `on:${a.name}`, value: '{…}' };
  if (a.type === 'BindDirective' || a.type === 'Binding') return { name: `bind:${a.name}`, value: '{…}' };
  if (a.type === 'SpreadAttribute' || a.type === 'Spread') return { name: '...spread', value: 'spread' };
  return null;
}
