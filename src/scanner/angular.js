import fs from 'node:fs';
import path from 'node:path';
import { lineIndex } from './adapters/common.js';
import { startTags } from './adapters/html.js';
import { memberText } from './component.js';

/*
 * Angular components: classes decorated with @Component({ selector, template | templateUrl }). The element selector is
 * recorded as the component's `tag`, so <app-user-card> in any template resolves to it the same way custom elements do.
 * Inputs/outputs come from @Input/@Output and the signal APIs (input(), input.required(), model(), output()); state from
 * signal()/computed() fields; HttpClient calls from `this.http.get(...)`.
 */

const LIFECYCLE = { ngOnInit: 'mount', ngAfterViewInit: 'mount', ngOnChanges: 'update', ngDoCheck: 'update', ngAfterViewChecked: 'update', ngOnDestroy: 'unmount' };
const HTTP = /^this\.(http|httpClient|_http)\.(get|post|put|patch|delete)$/;

const decorator = (node, name) => (node.decorators ?? []).map((d) => d.expression).find((e) => e.type === 'CallExpression' && memberText(e.callee) === name);
export const isAngularComponent = (node) => !!decorator(node, 'Component');

const objectField = (obj, key) => obj?.properties?.find((p) => (p.key?.name ?? p.key?.value) === key)?.value;
const stringOf = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : undefined);

export function extractAngularComponent(classPath, { name, line, file, code }) {
  const node = classPath.node;
  const meta = decorator(node, 'Component').arguments[0];
  const selector = stringOf(objectField(meta, 'selector'));
  const text = (n, max = 40) => code.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, max);
  const record = {
    name,
    kind: 'class',
    line,
    // Only element selectors (`app-card`, not `[appTooltip]` attribute directives) become tags.
    ...(selector && /^[a-z][\w-]*$/.test(selector) && { tag: selector }),
    props: {},
    state: {},
    context: [],
    refs: [],
    hooks: [],
    lifecycle: [],
    jsx: [],
    apiCalls: [],
  };

  for (const member of node.body.body) {
    const key = member.key?.name;
    if (!key) continue;
    if (decorator(member, 'Input')) {
      record.props[key] = { type: member.typeAnnotation ? text(member.typeAnnotation.typeAnnotation, 60) : 'unknown', required: !!decorator(member, 'Input').arguments[0]?.properties?.some((p) => p.key?.name === 'required' && p.value.value === true), ...(member.value && { default: text(member.value) }) };
      continue;
    }
    if (decorator(member, 'Output')) {
      record.props[key] = { type: 'output', required: false };
      continue;
    }
    const init = member.value?.type === 'CallExpression' ? memberText(member.value.callee) : null;
    const typeArg = (member.value?.typeParameters ?? member.value?.typeArguments)?.params?.[0];
    if (init === 'input' || init === 'input.required' || init === 'model' || init === 'model.required') {
      record.props[key] = { type: typeArg ? text(typeArg, 60) : 'unknown', required: init.endsWith('.required'), ...(init.startsWith('input') && !init.endsWith('.required') && member.value.arguments[0] && { default: text(member.value.arguments[0]) }) };
    } else if (init === 'output') {
      record.props[key] = { type: 'output', required: false };
    } else if (init === 'signal' || init === 'computed') {
      record.state[key] = { source: init === 'signal' ? 'signal' : 'computed', ...(init === 'signal' && member.value.arguments[0] && { initial: text(member.value.arguments[0]) }) };
    } else if (LIFECYCLE[key] && member.type === 'ClassMethod') {
      record.lifecycle.push({ via: key, phases: [LIFECYCLE[key]], line: member.loc?.start.line });
    }
  }

  classPath.traverse({
    CallExpression(p) {
      const m = HTTP.exec(memberText(p.node.callee) ?? '');
      if (!m) return;
      const arg = p.node.arguments[0];
      const target = arg?.type === 'StringLiteral' ? arg.value : arg ? text(arg, 60) : undefined;
      const fn = p.getFunctionParent();
      record.apiCalls.push({ via: `HttpClient.${m[2]}`, method: m[2].toUpperCase(), ...(target && { target }), in: fn?.node.key?.name ?? fn?.node.id?.name ?? 'class', ...(p.node.loc && { line: p.node.loc.start.line }) });
    },
  });

  // Template: inline, or templateUrl relative to the component file. Child components are element selectors.
  const inline = objectField(meta, 'template');
  const url = stringOf(objectField(meta, 'templateUrl'));
  let template = inline ? code.slice(inline.start + 1, inline.end - 1) : null;
  let firstLine = inline?.loc?.start.line ?? 1;
  if (!template && url) {
    try {
      template = fs.readFileSync(path.resolve(path.dirname(file), url), 'utf8');
      firstLine = 1;
    } catch {}
  }
  if (template) {
    const lineOf = lineIndex(template);
    const classes = new Set();
    for (const { tag, attrs, offset } of startTags(template)) {
      if (tag.includes('-')) record.jsx.push({ name: tag.toLowerCase(), line: firstLine + lineOf(offset) - 1, props: [...attrs].map(([n, v]) => ({ name: n, value: JSON.stringify(v) })) });
      for (const c of (attrs.get('class') ?? '').split(/\s+/).filter(Boolean)) classes.add(c);
    }
    if (classes.size) record.styles = { classes: [...classes] };
  }
  return record;
}
