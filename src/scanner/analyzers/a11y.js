/*
 * Static accessibility checks on markup, shared by every framework: JSX, Vue templates and HTML pages hand in elements
 * as { tag, attrs: Map(name → string | true), text: boolean | null, line }. `text` says whether the element has visible
 * text content (null when unknown, which suppresses the label check rather than guessing).
 *
 * Rules (the static subset of WCAG checks that need no rendering): images without alt, buttons and links without an
 * accessible name, form fields without a label, click handlers on non-interactive elements without keyboard support,
 * positive tabIndex, <html> without lang.
 */

const NON_INTERACTIVE = /^(div|span|li|p|img|section|article|td|tr|label|h[1-6])$/;
const FIELD = /^(input|select|textarea)$/;
const NAMED = (attrs) => ['aria-label', 'aria-labelledby', 'title', 'ariaLabel'].some((a) => attrs.has(a));
const issue = (type, severity, message, line, fix) => ({ type, severity, message, ...(line && { line }), fix });

/** Normalizes framework attribute spellings: onClick / @click / v-on:click / on:click / (click) → 'click handler'. */
const hasClick = (attrs) => [...attrs.keys()].some((k) => /^(onClick|onclick|@click|v-on:click|on:click|\(click\))$/.test(k));
const hasKeyboard = (attrs) => [...attrs.keys()].some((k) => /^(onKey(Down|Up|Press)|onkey(down|up|press)|@key(down|up)|v-on:key(down|up)|on:key(down|up)|\(key(down|up)[^)]*\))/.test(k));

export function a11yIssues({ tag, attrs, text, line, inLabel = false }) {
  const out = [];
  const t = tag.toLowerCase();
  const hidden = attrs.get('aria-hidden') === 'true' || attrs.get('aria-hidden') === true || /^(presentation|none)$/.test(String(attrs.get('role') ?? ''));
  if (t === 'img' && !attrs.has('alt') && !attrs.has(':alt') && !attrs.has('[alt]') && !hidden) {
    out.push(issue('a11y-img-alt', 'medium', '<img> has no alt text', line, 'add alt="…" describing the image, or alt="" if it is decorative'));
  }
  if ((t === 'button' || (t === 'a' && attrs.has('href'))) && text === false && !NAMED(attrs) && !hidden) {
    out.push(issue('a11y-control-name', 'medium', `<${t}> has no text or aria-label, so screen readers announce nothing`, line, 'add visible text or aria-label'));
  }
  if (FIELD.test(t) && !inLabel && !['hidden', 'submit', 'button', 'reset', 'image'].includes(String(attrs.get('type') ?? '')) && !NAMED(attrs) && !attrs.has('id') && !attrs.has(':id')) {
    out.push(issue('a11y-field-label', 'medium', `<${t}> has no label (no aria-label, and no id for a <label for>)`, line, 'wrap it in <label>, link one with id/for, or add aria-label'));
  }
  if (NON_INTERACTIVE.test(t) && hasClick(attrs) && !attrs.has('role') && !hasKeyboard(attrs)) {
    out.push(issue('a11y-click-handler', 'low', `click handler on <${t}> without a role or keyboard handler; keyboard users cannot trigger it`, line, 'use a <button>, or add role="button", tabIndex={0} and a key handler'));
  }
  const rawTab = attrs.get('tabIndex') ?? attrs.get('tabindex');
  const tab = typeof rawTab === 'string' ? Number(rawTab) : NaN;
  if (tab > 0) out.push(issue('a11y-tabindex', 'low', `tabIndex=${tab} changes the natural tab order`, line, 'use 0 or -1'));
  if (t === 'html' && !attrs.has('lang')) out.push(issue('a11y-html-lang', 'medium', '<html> has no lang attribute', line, 'add lang="en" (or the page language)'));
  return out;
}

/** A JSX attribute value as a string when it is a literal ("x", {3}, {-1}), otherwise true (present, value unknown). */
function literal(v) {
  if (!v) return true;
  if (v.type === 'StringLiteral') return v.value;
  const e = v.type === 'JSXExpressionContainer' ? v.expression : null;
  if (e?.type === 'NumericLiteral' || e?.type === 'StringLiteral') return String(e.value);
  if (e?.type === 'UnaryExpression' && e.operator === '-' && e.argument.type === 'NumericLiteral') return String(-e.argument.value);
  return true;
}

/** JSX: checks intrinsic elements inside a component. Returns issues; expression children count as text. */
export function jsxA11y(fnPath) {
  const out = [];
  fnPath.traverse({
    JSXElement(p) {
      const open = p.node.openingElement;
      if (open.name.type !== 'JSXIdentifier' || !/^[a-z]/.test(open.name.name)) return;
      if (open.attributes.some((a) => a.type === 'JSXSpreadAttribute')) return; // spread props may carry the label
      const attrs = new Map(open.attributes.map((a) => [a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name, literal(a.value)]));
      const text = p.node.children.some((c) => (c.type === 'JSXText' && c.value.trim()) || (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression'));
      // Children that are components (e.g. <Trans>) may render text; only report when the children are plain elements.
      const unknown = p.node.children.some((c) => c.type === 'JSXElement' && /^[A-Z]/.test(c.openingElement.name.name ?? ''));
      // A field nested in <label> is labelled by it.
      const inLabel = !!p.findParent((a) => a.isJSXElement() && a.node.openingElement.name.name === 'label');
      out.push(...a11yIssues({ tag: open.name.name, attrs, text: text ? true : unknown ? null : false, line: open.loc?.start.line, inLabel }));
    },
  });
  return out;
}
