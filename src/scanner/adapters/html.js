import fs from 'node:fs';
import path from 'node:path';
import { deriveName } from '../parse-file.js';
import { a11yIssues } from '../analyzers/a11y.js';
import { lineIndex } from './common.js';

/*
 * Plain HTML pages (static sites, server-rendered templates saved as .html, Alpine/htmx/Stimulus sites). Each file is
 * one page component: custom elements it uses are its children, <script src> files are imports (so their components
 * and dead-code status link up), stylesheets resolve classes, htmx attributes and forms are API calls, Alpine `x-data`
 * objects are state, Stimulus controllers and named Alpine components are recorded as hooks.
 *
 * A small tag scanner is enough here: only start tags and their attributes matter, and <script>/<style>/comment bodies
 * are skipped so markup inside them is not mistaken for elements.
 */

const RAW_TEXT = /^(script|style|textarea|title)$/i;
const HTMX = { 'hx-get': 'GET', 'hx-post': 'POST', 'hx-put': 'PUT', 'hx-patch': 'PATCH', 'hx-delete': 'DELETE' };

/** Start tags with attributes, in document order: [{ tag, attrs: Map, offset }]. Also used for Angular templates. */
export function startTags(code) {
  const tags = [];
  const re = /<!--[\s\S]*?-->|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let m;
  while ((m = re.exec(code))) {
    if (!m[1]) continue;
    const attrs = new Map();
    for (const a of m[2].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs.set(a[1], a[2] ?? a[3] ?? a[4] ?? '');
    tags.push({ tag: m[1], attrs, offset: m.index });
    if (RAW_TEXT.test(m[1])) {
      const close = code.toLowerCase().indexOf(`</${m[1].toLowerCase()}`, re.lastIndex);
      if (close !== -1) re.lastIndex = close;
    }
  }
  return tags;
}

/**
 * Accessibility issues in HTML-like markup (HTML pages, Angular templates). `lineOf` maps an offset to a line in the
 * real file. Text of a button/link is whatever sits before its closing tag, minus nested tags; a field inside a
 * <label>…</label> range counts as labelled.
 */
export function markupA11y(code, lineOf) {
  const lowerCode = code.toLowerCase();
  const labels = [...lowerCode.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => [m.index, m.index + m[0].length]);
  const issues = [];
  for (const { tag, attrs, offset } of startTags(code)) {
    const lower = tag.toLowerCase();
    const close = lower === 'button' || lower === 'a' ? lowerCode.indexOf(`</${lower}`, offset) : -1;
    const inner = close === -1 ? null : code.slice(code.indexOf('>', offset) + 1, close);
    // {{ interpolation }} (Angular) counts as text; a custom element inside may render it, so that stays unknown.
    const text = inner === null ? null : /\S/.test(inner.replace(/<[^>]*>/g, '')) ? true : /<[a-z]+-[\w-]*/i.test(inner) ? null : false;
    issues.push(...a11yIssues({ tag: lower, attrs, text, line: lineOf(offset), inLabel: labels.some(([a, b]) => offset > a && offset < b) }));
  }
  return issues;
}

/** `src`/`href` as an import specifier: relative paths stay relative, `/x` is looked up from the nearest folder holding it. */
function localRef(file, ref) {
  if (!ref || /^(https?:|\/\/|data:|#|mailto:)/.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0];
  if (!clean.startsWith('/')) return clean.startsWith('.') ? clean : `./${clean}`;
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const abs = path.join(dir, clean);
    if (fs.existsSync(abs)) return path.relative(path.dirname(file), abs).split(path.sep).join('/').replace(/^(?!\.)/, './');
    if (path.dirname(dir) === dir) return null;
  }
}

export function parseHtml(file, code) {
  const lineOf = lineIndex(code);
  const mod = { file, imports: new Map(), exports: new Map(), reexports: [], exportAll: [], aliases: new Map(), components: [], routes: [], typeImports: [], styleImports: [] };
  const record = { name: deriveName(file), kind: 'function', line: 1, props: {}, state: {}, context: [], refs: [], hooks: [], lifecycle: [], jsx: [], apiCalls: [] };
  const classes = new Set();
  const hooks = new Map();

  const issues = markupA11y(code, lineOf);
  for (const { tag, attrs, offset } of startTags(code)) {
    const line = lineOf(offset);
    const lower = tag.toLowerCase();
    if (lower === 'script' && attrs.get('src')) {
      const source = localRef(file, attrs.get('src'));
      if (source) mod.imports.set(`__script${line}`, { source, imported: '*' });
    }
    if (lower === 'link' && /\bstylesheet\b/.test(attrs.get('rel') ?? '')) {
      const source = localRef(file, attrs.get('href'));
      if (source) mod.styleImports.push({ source, module: false });
    }
    if (lower.includes('-')) record.jsx.push({ name: lower, line, props: [...attrs].map(([name, value]) => ({ name, value: JSON.stringify(value) })) });
    for (const c of (attrs.get('class') ?? '').split(/\s+/).filter(Boolean)) classes.add(c);
    for (const [attr, method] of Object.entries(HTMX)) if (attrs.has(attr)) record.apiCalls.push({ via: 'htmx', method, target: attrs.get(attr), in: lower, line });
    if (lower === 'form' && attrs.get('action')) record.apiCalls.push({ via: 'form', method: (attrs.get('method') ?? 'GET').toUpperCase(), target: attrs.get('action'), in: 'form', line });
    const xData = attrs.get('x-data');
    if (xData !== undefined) {
      // x-data="{ open: false }" → state keys; x-data="dropdown()" → a named Alpine component.
      const named = /^\s*([A-Za-z_$][\w$]*)\s*(\(|$)/.exec(xData);
      if (named) hooks.set(`alpine:${named[1]}`, (hooks.get(`alpine:${named[1]}`) ?? 0) + 1);
      else for (const k of xData.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) record.state[k[1]] ??= { source: 'x-data' };
    }
    for (const controller of (attrs.get('data-controller') ?? '').split(/\s+/).filter(Boolean)) hooks.set(`stimulus:${controller}`, (hooks.get(`stimulus:${controller}`) ?? 0) + 1);
  }
  record.hooks = [...hooks].map(([name, count]) => ({ name, category: 'custom', ...(count > 1 && { count }) }));
  if (classes.size) record.styles = { classes: [...classes] };
  if (issues.length) record.issues = issues;
  mod.exports.set('default', record.name);
  mod.components = [record];
  return mod;
}
