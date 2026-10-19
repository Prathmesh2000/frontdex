import { memberText } from '../component.js';
import { cssValues } from './tokens.js';

/*
 * CSS-in-JS: styled-components / Emotion styled components and JS theme objects.
 *   const Button = styled.button`color: #3b82f6;`     → a `styled` component rendering <button>
 *   const Primary = styled(Button)({ padding: 8 })    → a `styled` component rendering Button
 *   const theme = { colors: { primary: '#3b82f6' } }  → tokens theme.colors.primary (also createTheme/extendTheme)
 * Literal values in their CSS feed the same token-drift check as stylesheets.
 */

const STYLED = /^(styled|tw)$/;
const THEME_NAME = /theme|tokens/i;
const THEME_FACTORY = /^(createTheme|extendTheme|createGlobalTheme|defineConfig|createStitches)$/;

/** For `styled.x\`\``, `styled(X)\`\``, `styled.x.attrs(…)\`\`` and the object-call forms: { element } or { base }. */
export function styledTarget(node) {
  let tag = node.type === 'TaggedTemplateExpression' ? node.tag : node.type === 'CallExpression' ? node.callee : null;
  // Peel `.attrs(...)` and `.withConfig(...)`.
  while (tag?.type === 'CallExpression' && tag.callee.type === 'MemberExpression' && /^(attrs|withConfig)$/.test(tag.callee.property.name)) tag = tag.callee.object;
  if (tag?.type === 'MemberExpression' && STYLED.test(tag.object.name ?? '') && tag.property.type === 'Identifier') return { element: tag.property.name };
  if (tag?.type === 'CallExpression' && STYLED.test(memberText(tag.callee) ?? '')) {
    const arg = tag.arguments[0];
    if (arg?.type === 'StringLiteral') return { element: arg.value };
    if (arg?.type === 'Identifier') return { base: arg.name };
  }
  return null;
}

/** CSS text of a styled declaration: template quasis (interpolations blanked) or an object literal's string values. */
export function styledCss(node) {
  if (node.type === 'TaggedTemplateExpression') return node.quasi.quasis.map((q) => q.value.cooked ?? q.value.raw).join(' ');
  const obj = node.arguments?.find((a) => a.type === 'ObjectExpression');
  if (!obj) return '';
  const lines = [];
  const walk = (o) => {
    for (const p of o.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const key = (p.key.name ?? p.key.value ?? '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      if (p.value.type === 'StringLiteral') lines.push(`${key}: ${p.value.value};`);
      else if (p.value.type === 'NumericLiteral' && p.value.value !== 0) lines.push(`${key}: ${p.value.value}px;`);
      else if (p.value.type === 'ObjectExpression') walk(p.value);
    }
  };
  walk(obj);
  return lines.join('\n');
}

/** Literal colors/sizes in a styled component's CSS, with lines relative to the declaration. */
export function styledLiterals(node) {
  const { literals } = cssValues(styledCss(node));
  const base = node.loc?.start.line ?? 1;
  return literals.map((l) => ({ ...l, line: base + l.line - 1 }));
}

/** Theme objects in a module: `const theme = {…}` / `export const tokens = {…}` / `createTheme({…})`. */
export function themeTokens(program) {
  const out = {};
  const flatten = (obj, prefix) => {
    for (const p of obj.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const name = `${prefix}.${p.key.name ?? p.key.value}`;
      if (p.value.type === 'StringLiteral') out[name] ??= { value: p.value.value, line: p.value.loc?.start.line };
      else if (p.value.type === 'NumericLiteral') out[name] ??= { value: String(p.value.value), line: p.value.loc?.start.line };
      else if (p.value.type === 'ObjectExpression') flatten(p.value, name);
    }
  };
  for (const stmt of program.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type !== 'VariableDeclaration') continue;
    for (const d of decl.declarations) {
      let init = d.init;
      while (init?.type === 'TSAsExpression' || init?.type === 'TSSatisfiesExpression') init = init.expression;
      const factory = init?.type === 'CallExpression' && THEME_FACTORY.test(memberText(init.callee) ?? '');
      const obj = factory ? init.arguments.find((a) => a.type === 'ObjectExpression') : init?.type === 'ObjectExpression' && THEME_NAME.test(d.id.name ?? '') ? init : null;
      if (obj) flatten(obj, 'theme');
    }
  }
  return out;
}
