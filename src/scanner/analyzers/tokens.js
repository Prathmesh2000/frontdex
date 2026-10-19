import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

/*
 * Design tokens and drift. Tokens come from CSS custom properties (`--color-primary: #3b82f6`, Tailwind v4 `@theme`)
 * and from Tailwind's JS config (`theme.colors`, `theme.extend.spacing`, …). Drift is a hard-coded value that equals or
 * nearly equals a token: in stylesheets, and in Tailwind arbitrary values on components (`bg-[#3b82f6]`). Every finding
 * carries both sides as evidence: where the value is used and where the token is defined.
 */

const NEAR_COLOR = 12; // max RGB distance (of 441) for a "near" match
const SIZE_PROPS = /^(margin|padding|gap|row-gap|column-gap|border-radius|font-size|inset|top|right|bottom|left)(-|$)/;
const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
const LENGTH_RE = /(?<![\w.-])(\d*\.?\d+)(px|rem)\b/g;

/** Normalizes a CSS color to #rrggbb (alpha dropped), or null. */
export function normalizeColor(value) {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return `#${[...h.slice(0, 3)].map((c) => c + c).join('')}`;
    if (h.length === 6 || h.length === 8) return `#${h.slice(0, 6)}`;
    return null;
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (m) return `#${m.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a, b) => Math.hypot(...rgb(a).map((x, i) => x - rgb(b)[i]));
const px = (n, unit) => (unit === 'rem' ? n * 16 : n);

/** Custom properties and literal colors/lengths in one stylesheet (text with comments blanked, newlines kept). */
export function cssValues(text) {
  const tokens = {};
  const literals = [];
  const lineAt = (offset) => text.slice(0, offset).split('\n').length;
  for (const m of text.matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
    const [, prop, value] = m;
    const line = lineAt(m.index);
    if (prop.startsWith('--')) {
      tokens[prop] ??= { value: value.trim(), line };
      continue;
    }
    if (value.includes('var(')) continue;
    for (const c of value.matchAll(COLOR_RE)) literals.push({ prop, value: c[0], line });
    if (SIZE_PROPS.test(prop)) for (const l of value.matchAll(LENGTH_RE)) if (Number(l[1]) > 1) literals.push({ prop, value: l[0], line });
  }
  return { tokens, literals };
}

/** Tailwind JS config themes (root and workspace packages): colors, spacing, radius and font sizes as tokens. */
export function tailwindTokens(roots, rel) {
  const out = {};
  for (const root of roots) {
    const file = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
    if (!file) continue;
    let ast;
    try {
      ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['typescript'], errorRecovery: true });
    } catch {
      continue;
    }
    const theme = findProperty(ast.program, 'theme');
    for (const section of ['colors', 'spacing', 'borderRadius', 'fontSize']) {
      for (const holder of [theme, findProperty(theme, 'extend')]) {
        const obj = findProperty(holder, section);
        if (obj?.type === 'ObjectExpression') flatten(obj, section === 'colors' ? 'colors' : section, (name, node) => (out[name] ??= { value: node.value, at: `${rel(file)}:${node.loc.start.line}`, source: 'tailwind' }));
      }
    }
  }
  return out;
}

function findProperty(node, key) {
  if (!node) return null;
  let found = null;
  const visit = (n) => {
    if (found || !n || typeof n !== 'object') return;
    if (n.type === 'ObjectProperty' && (n.key.name ?? n.key.value) === key && n.value.type === 'ObjectExpression') return void (found = n.value);
    for (const v of Object.values(n)) if (v && typeof v === 'object' && v !== n.loc) visit(v);
  };
  visit(node.type === 'ObjectExpression' ? { body: node.properties } : node);
  return found;
}

function flatten(obj, prefix, emit) {
  for (const p of obj.properties) {
    if (p.type !== 'ObjectProperty') continue;
    const name = `${prefix}.${p.key.name ?? p.key.value}`;
    if (p.value.type === 'StringLiteral') emit(name.replace(/\.DEFAULT$/, ''), p.value);
    else if (p.value.type === 'ObjectExpression') flatten(p.value, name, emit);
  }
}

/**
 * Token definitions and drift findings. `sheets` maps a stylesheet path to { tokens, literals }; components carry their
 * resolved classes. Components with drifting arbitrary values get a `token-drift` issue.
 */
export function tokenReport({ sheets, components, tailwind }) {
  const definitions = { ...tailwind };
  for (const [file, sheet] of Object.entries(sheets)) for (const [name, t] of Object.entries(sheet.tokens ?? {})) definitions[name] ??= { value: t.value, at: `${file}:${t.line}`, source: 'css' };
  const colors = [];
  const sizes = new Map();
  for (const [name, t] of Object.entries(definitions)) {
    const color = normalizeColor(t.value);
    if (color) colors.push({ name, color });
    const len = /^(\d*\.?\d+)(px|rem)$/.exec(t.value.trim());
    if (len && !sizes.has(px(Number(len[1]), len[2]))) sizes.set(px(Number(len[1]), len[2]), name);
  }
  if (!colors.length && !sizes.size) return { definitions, drift: [] };

  const match = (value) => {
    const color = normalizeColor(value);
    if (color) {
      let best = null;
      for (const c of colors) {
        const d = distance(color, c.color);
        if (d <= NEAR_COLOR && (!best || d < best.d)) best = { d, token: c.name };
      }
      return best && { token: best.token, match: best.d === 0 ? 'exact' : 'near' };
    }
    const len = /^(\d*\.?\d+)(px|rem)$/.exec(value);
    const token = len && sizes.get(px(Number(len[1]), len[2]));
    return token ? { token, match: 'exact' } : null;
  };
  // Tailwind tokens are used as classes (bg-brand-500), CSS ones as var(--x).
  const use = (token) => (definitions[token].source === 'tailwind' ? token.split('.').slice(1).join('-') : `var(${token})`);

  const drift = [];
  for (const [file, sheet] of Object.entries(sheets)) {
    for (const l of sheet.literals ?? []) {
      const m = match(l.value);
      if (m) drift.push({ value: l.value, at: `${file}:${l.line}`, property: l.prop, token: m.token, defined: definitions[m.token].at, match: m.match, use: use(m.token) });
    }
  }
  for (const c of Object.values(components)) {
    for (const cls of c.styles?.classes ?? []) {
      const arbitrary = /\[([^\]]+)\]$/.exec(cls.name)?.[1];
      const m = arbitrary && match(arbitrary.replace(/_/g, ' '));
      if (!m) continue;
      drift.push({ value: cls.name, at: `${c.file}:${c.line}`, property: 'class', token: m.token, defined: definitions[m.token].at, match: m.match, use: use(m.token) });
      (c.issues ??= []).push({ type: 'token-drift', severity: 'low', message: `class ${cls.name} hard-codes ${m.match === 'exact' ? 'the value of' : 'a value close to'} token ${m.token} (${definitions[m.token].at})`, ...(c.line && { line: c.line }), fix: `use ${use(m.token)}` });
    }
  }
  return { definitions, drift };
}
