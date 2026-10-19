import { memberText } from './component.js';

/*
 * Custom elements: classes extending HTMLElement, LitElement, FASTElement and similar, registered with
 * customElements.define('x-tag', Cls) or @customElement('x-tag'). Recorded as class components with a `tag`, so markup
 * that uses <x-tag> (HTML pages, Lit templates, other frameworks) links to them.
 */

const ELEMENT_BASE = /(^|\.)(HTMLElement|LitElement|FASTElement|ReactiveElement|[A-Z]\w*Element)$/;
const LIFECYCLE = { connectedCallback: 'mount', firstUpdated: 'mount', disconnectedCallback: 'unmount', updated: 'update', attributeChangedCallback: 'update', willUpdate: 'update' };
const TAG_IN_TEMPLATE = /<([a-z][\w]*-[\w-]*)([^>]*)>/g;

export const isElementClass = (superClass) => !!superClass && ELEMENT_BASE.test(memberText(superClass) ?? '');

/** `customElements.define('x-tag', Cls)` calls anywhere in the module: Map class name → tag. */
export function definedTags(programPath) {
  const tags = new Map();
  programPath.traverse({
    CallExpression(p) {
      const [tag, cls] = p.node.arguments;
      if (/(^|\.)customElements\.define$/.test(memberText(p.node.callee) ?? '') && tag?.type === 'StringLiteral' && cls?.type === 'Identifier') tags.set(cls.name, tag.value);
    },
  });
  return tags;
}

const decoratorCall = (node, name) => (node.decorators ?? []).map((d) => d.expression).find((e) => e.type === 'CallExpression' && memberText(e.callee) === name) ?? (node.decorators ?? []).find((d) => memberText(d.expression) === name)?.expression;

/** Builds the component record for a custom element class. `code` is the module source, for template text. */
export function extractCustomElement(classPath, { name, line, tag, code }) {
  const node = classPath.node;
  const decoratorTag = decoratorCall(node, 'customElement')?.arguments?.[0];
  const record = { name, kind: 'class', line, tag: tag ?? (decoratorTag?.type === 'StringLiteral' ? decoratorTag.value : undefined), props: {}, state: {}, context: [], refs: [], hooks: [], lifecycle: [], jsx: [] };
  const text = (n, max = 40) => code.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, max);

  for (const member of node.body.body) {
    const key = member.key?.name ?? member.key?.value;
    if (!key) continue;
    // Lit: `static properties = { name: { type: String }, open: { state: true } }`
    if (member.static && key === 'properties' && member.value?.type === 'ObjectExpression') {
      for (const p of member.value.properties) {
        const opts = p.value?.type === 'ObjectExpression' ? Object.fromEntries(p.value.properties.map((o) => [o.key?.name, o.value])) : {};
        const propName = p.key?.name ?? p.key?.value;
        if (opts.state?.value === true) record.state[propName] = { source: 'field' };
        else record.props[propName] = { type: opts.type ? text(opts.type) : 'unknown', required: false };
      }
      continue;
    }
    if (member.static && key === 'observedAttributes') {
      const list = member.value?.type === 'ArrayExpression' ? member.value : member.body?.body?.find((s) => s.type === 'ReturnStatement')?.argument;
      for (const el of list?.elements ?? []) if (el?.type === 'StringLiteral') record.props[el.value] = { type: 'string', required: false };
      continue;
    }
    // Lit decorators: `@property({ type: Number }) count = 0`, `@state() open = false`
    const property = decoratorCall(member, 'property');
    if (property) {
      const opts = property.arguments?.[0]?.type === 'ObjectExpression' ? Object.fromEntries(property.arguments[0].properties.map((o) => [o.key?.name, o.value])) : {};
      const type = member.typeAnnotation ? text(member.typeAnnotation.typeAnnotation) : opts.type ? text(opts.type) : 'unknown';
      record.props[key] = { type, required: false, ...(member.value && { default: text(member.value) }) };
      continue;
    }
    if (decoratorCall(member, 'state') || decoratorCall(member, 'internalProperty')) {
      record.state[key] = { source: 'field', ...(member.value && { initial: text(member.value) }) };
      continue;
    }
    if (LIFECYCLE[key] && (member.type === 'ClassMethod' || member.type === 'ClassPrivateMethod')) record.lifecycle.push({ via: key, phases: [LIFECYCLE[key]], line: member.loc?.start.line });
  }

  // Child custom elements and classes used in html`` templates (Lit) or innerHTML strings.
  const classes = new Set();
  classPath.traverse({
    TemplateLiteral(p) {
      const raw = p.node.quasis.map((q) => q.value.raw).join('${}');
      for (const m of raw.matchAll(TAG_IN_TEMPLATE)) {
        const props = [...m[2].matchAll(/([.@?]?[\w:-]+)=/g)].map((a) => ({ name: a[1], value: '…' }));
        record.jsx.push({ name: m[1], line: p.node.loc?.start.line, props });
      }
      for (const m of raw.matchAll(/class="([^"$]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
  });
  if (classes.size) record.styles = { classes: [...classes] };
  return record;
}
