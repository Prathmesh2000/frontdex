// Route and link path expressions, shared by route declarations (parse-file.js) and navigation targets
// (component.js): parsed into parts at parse time, evaluated in graph.js once every module's constants are known.
import { memberText } from './component.js';

const keyName = (node) => (node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : undefined);

export function joinRoute(segments) {
  let out = '';
  for (const seg of segments) {
    if (seg == null) continue;
    out = seg.startsWith('/') ? seg : `${out.replace(/\/$/, '')}/${seg}`;
  }
  out = out.replace(/\/+/g, '/');
  return out === '' ? '/' : out.length > 1 ? out.replace(/\/$/, '') : out;
}

/**
 * A path expression as parts, evaluated in graph.js once every module is parsed, because the constants it names
 * (ROUTES.HOME) usually live in another file. Parts are strings, { ref: 'ROUTES.HOME' } and { slice: parts, args } for
 * `.slice(1)`. Anything else becomes a ref that will not resolve and shows as {text}.
 */
export function pathParts(node) {
  if (typeof node === 'string') return [node];
  while (node?.type === 'TSAsExpression' || node?.type === 'TSNonNullExpression') node = node.expression;
  if (node?.type === 'StringLiteral') return [node.value];
  if (node?.type === 'TemplateLiteral') return node.quasis.flatMap((q, i) => [q.value.cooked, ...(i < node.expressions.length ? pathParts(node.expressions[i]) : [])]);
  if (node?.type === 'BinaryExpression' && node.operator === '+') return [...pathParts(node.left), ...pathParts(node.right)];
  const callee = node?.type === 'CallExpression' ? node.callee : null;
  if (callee?.type === 'MemberExpression' && keyName(callee.property) === 'slice') {
    const args = node.arguments.map((a) => (a.type === 'NumericLiteral' ? a.value : a.type === 'UnaryExpression' && a.operator === '-' && a.argument.type === 'NumericLiteral' ? -a.argument.value : NaN));
    if (!args.some(Number.isNaN)) return [{ slice: pathParts(callee.object), args }];
  }
  return [{ ref: memberText(node) ?? 'dynamic' }];
}

export function evalParts(parts, lookup) {
  let out = '';
  for (const p of parts) {
    if (typeof p === 'string') out += p;
    else if (p.slice) out += evalParts(p.slice, lookup).slice(...p.args);
    else {
      const value = lookup(p.ref);
      out += typeof value === 'string' ? value : `{${p.ref}}`;
    }
  }
  return out;
}

/** Joins a route's segments (outermost first; null for pathless and index routes) into its path. */
export const routePath = (segments, lookup) => joinRoute(segments.map((s) => (s ? evalParts(s, lookup) : null)));

/**
 * Whether a concrete-ish path (`/users/{id}/edit`, from a navigate() call) can land on a route pattern
 * (`/users/:userId/edit`, `/blog/[...slug]`, `/docs/*`). `{…}` (unresolved), `:x`, `[x]` and `$x` match one segment;
 * catch-alls (`*`, `[...x]`, `[[...x]]`, `$`) match the rest.
 */
export function pathMatches(path, route) {
  const a = path.split('?')[0].split('#')[0].split('/').filter(Boolean);
  const b = route.split(' (')[0].split('/').filter(Boolean);
  const any = (s) => /^(:|\$|\{|\[)/.test(s);
  for (let i = 0; i < b.length; i++) {
    if (b[i] === '*' || b[i] === '$' || /^\[\[?\.\.\./.test(b[i])) return true;
    if (i >= a.length) return false;
    if (a[i] !== b[i] && !any(a[i]) && !any(b[i])) return false;
  }
  return a.length === b.length;
}
