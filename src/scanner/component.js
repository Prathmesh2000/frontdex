const MAX_TEXT = 80;
const SIGNALS = { createSignal: 'signal', createStore: 'signal', createMemo: 'computed', useSignal: 'signal', useStore: 'signal', useComputed$: 'computed' };
const MAX_CALLS = 12;

const HOOK_CATEGORY = {
  useState: 'state',
  useReducer: 'state',
  useSyncExternalStore: 'state',
  useOptimistic: 'state',
  useActionState: 'state',
  useFormState: 'state',
  useEffect: 'effect',
  useLayoutEffect: 'effect',
  useInsertionEffect: 'effect',
  useContext: 'context',
  use: 'context',
  useRef: 'ref',
  useImperativeHandle: 'ref',
  useMemo: 'memo',
  useCallback: 'memo',
  useDeferredValue: 'memo',
  useTransition: 'memo',
  useId: 'memo',
  useRouter: 'router',
  usePathname: 'router',
  useSearchParams: 'router',
  useParams: 'router',
  useSelectedLayoutSegment: 'router',
  useNavigate: 'router',
  useLocation: 'router',
  useMatch: 'router',
  useQuery: 'data',
  useMutation: 'data',
  useInfiniteQuery: 'data',
  useQueryClient: 'data',
  useSWR: 'data',
  useSWRMutation: 'data',
  useSelector: 'data',
  useDispatch: 'data',
  useStore: 'data',
  useFormStatus: 'data',
};

export const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

export const CLASS_LIFECYCLE = {
  constructor: ['mount'],
  UNSAFE_componentWillMount: ['mount'],
  componentDidMount: ['mount'],
  getDerivedStateFromProps: ['mount', 'update'],
  UNSAFE_componentWillReceiveProps: ['update'],
  shouldComponentUpdate: ['update'],
  getSnapshotBeforeUpdate: ['update'],
  componentDidUpdate: ['update'],
  componentWillUnmount: ['unmount'],
  getDerivedStateFromError: ['error'],
  componentDidCatch: ['error'],
};

const NOISE_CALLS = new Set([
  'then', 'catch', 'finally', 'map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every',
  'push', 'includes', 'json', 'toString', 'join', 'slice', 'concat', 'keys', 'values', 'entries',
]);

export function text(code, node, max = MAX_TEXT) {
  if (!node) return undefined;
  const s = code.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function memberText(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Super') return 'super';
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const obj = memberText(node.object);
    return obj ? `${obj}.${node.property.name}` : null;
  }
  return null;
}

export function hookName(callee) {
  const name =
    callee.type === 'Identifier'
      ? callee.name
      : callee.type === 'MemberExpression' && memberText(callee.object) === 'React'
        ? callee.property.name
        : null;
  return name && /^use(?:[A-Z0-9]|$)/.test(name) ? name : null;
}

export function calleeLabel(callee) {
  const full = memberText(callee);
  if (full) return full;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return NOISE_CALLS.has(callee.property.name) ? null : '.' + callee.property.name;
  }
  return null;
}

export function collectCalls(path, skipNode) {
  const calls = new Set();
  path.traverse({
    Function(p) {
      if (p.node === skipNode) p.skip();
    },
    CallExpression(p) {
      const label = calleeLabel(p.node.callee);
      if (label && !NOISE_CALLS.has(label.split('.').pop())) calls.add(label);
    },
  });
  return [...calls].slice(0, MAX_CALLS);
}

export function readJSDoc(node) {
  const comment = [...(node?.leadingComments ?? [])].reverse().find((c) => c.type === 'CommentBlock' && c.value.startsWith('*'));
  if (!comment) return {};
  const lines = comment.value.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trimEnd());
  const description = lines.filter((l) => !l.startsWith('@')).join('\n').trim();
  const deprecated = lines.some((l) => l.startsWith('@deprecated'));
  return { description: description || undefined, deprecated };
}

function typeMembers(node, mod, depth = 0) {
  const members = new Map();
  if (!node || depth > 6) return members;
  const merge = (other) => other.forEach((v, k) => members.set(k, v));
  switch (node.type) {
    case 'TSParenthesizedType':
      return typeMembers(node.typeAnnotation, mod, depth + 1);
    case 'TSIntersectionType':
      node.types.forEach((t) => merge(typeMembers(t, mod, depth + 1)));
      return members;
    case 'TSTypeLiteral':
      return membersOf(node.members, mod);
    case 'TSTypeReference': {
      const name = node.typeName.type === 'Identifier' ? node.typeName.name : memberText(node.typeName);
      const args = node.typeParameters?.params ?? [];
      if (/(^|\.)PropsWith(Children|Ref)$/.test(name) || name === 'Readonly' || name === 'Partial') {
        merge(typeMembers(args[0], mod, depth + 1));
        if (name.endsWith('PropsWithChildren')) members.set('children', { type: 'ReactNode', optional: true });
        if (name === 'Partial') members.forEach((m) => (m.optional = true));
        return members;
      }
      const decl = mod.types.get(name);
      if (decl?.type === 'TSTypeAliasDeclaration') return typeMembers(decl.typeAnnotation, mod, depth + 1);
      if (decl?.type === 'TSInterfaceDeclaration') {
        for (const ext of decl.extends ?? []) {
          const extName = memberText(ext.expression);
          if (extName) merge(typeMembers({ type: 'TSTypeReference', typeName: { type: 'Identifier', name: extName }, typeParameters: ext.typeParameters }, mod, depth + 1));
        }
        merge(membersOf(decl.body.body, mod));
      }
      return members;
    }
    default:
      return members;
  }
}

function membersOf(list, mod) {
  const members = new Map();
  for (const m of list) {
    if (m.type !== 'TSPropertySignature' && m.type !== 'TSMethodSignature') continue;
    const key = m.key.type === 'Identifier' ? m.key.name : m.key.value;
    if (!key) continue;
    const type =
      m.type === 'TSPropertySignature'
        ? text(mod.code, m.typeAnnotation?.typeAnnotation, 120) ?? 'unknown'
        : text(mod.code, m, 120).replace(/;$/, '');
    members.set(key, { type, optional: !!m.optional, description: readJSDoc(m).description });
  }
  return members;
}

function propTypesOf(objectNode, mod) {
  const out = new Map();
  if (objectNode?.type !== 'ObjectExpression') return out;
  for (const p of objectNode.properties) {
    if (p.type !== 'ObjectProperty') continue;
    const key = p.key.name ?? p.key.value;
    const raw = text(mod.code, p.value, 120);
    const required = /\.isRequired$/.test(raw);
    out.set(key, { type: raw.replace(/^(React\.)?PropTypes\./, '').replace(/\.isRequired$/, ''), required });
  }
  return out;
}

function defaultsOf(objectNode, mod) {
  const out = new Map();
  if (objectNode?.type !== 'ObjectExpression') return out;
  for (const p of objectNode.properties) {
    if (p.type === 'ObjectProperty') out.set(p.key.name ?? p.key.value, text(mod.code, p.value));
  }
  return out;
}

function buildProps({ members, destructured, accessed, propTypes, defaults }) {
  const names = new Set([...members.keys(), ...destructured.keys(), ...propTypes.keys(), ...defaults.keys(), ...accessed]);
  const props = {};
  for (const name of names) {
    const m = members.get(name);
    const pt = propTypes.get(name);
    const def = destructured.get(name) ?? defaults.get(name);
    const prop = { type: m?.type ?? pt?.type ?? 'unknown' };
    prop.required = def === undefined && (m ? !m.optional : !!pt?.required);
    if (def !== undefined) prop.default = def;
    if (m?.description) prop.description = m.description;
    props[name] = prop;
  }
  return props;
}

function newRecord(name, kind, line) {
  return { name, kind, line, props: {}, state: {}, context: [], refs: [], hooks: new Map(), lifecycle: [], jsx: [] };
}

function addJsx(record, path, code) {
  path.traverse({
    JSXOpeningElement(p) {
      const n = p.node.name;
      const name = n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? jsxMemberName(n) : null;
      if (!name || !/^[A-Z]/.test(name) || /^(React\.)?Fragment$/.test(name)) return;
      const props = p.node.attributes.map((a) =>
        a.type === 'JSXSpreadAttribute'
          ? { name: `...${text(code, a.argument, 30)}`, value: 'spread' }
          : { name: a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name, value: !a.value ? 'true' : a.value.type === 'StringLiteral' ? JSON.stringify(a.value.value) : text(code, a.value.expression ?? a.value, 50) },
      );
      record.jsx.push({ name, line: p.node.loc?.start.line, props });
    },
    JSXAttribute(p) {
      const v = p.node.value;
      if (v?.type === 'JSXExpressionContainer' && v.expression.type === 'Identifier' && /^[A-Z][a-z]/.test(v.expression.name)) {
        record.jsx.push({ name: v.expression.name, line: p.node.loc?.start.line, soft: true });
      }
    },
  });
}

function jsxMemberName(n) {
  return n.type === 'JSXIdentifier' ? n.name : `${jsxMemberName(n.object)}.${n.property.name}`;
}

function finish(record) {
  record.hooks = [...record.hooks.entries()].map(([name, count]) => ({
    name,
    category: HOOK_CATEGORY[name] ?? 'custom',
    ...(count > 1 ? { count } : {}),
  }));
  record.context = [...new Set(record.context)];
  record.refs = [...new Set(record.refs)];
  return record;
}

export function extractFunctionComponent(fnPath, ctx) {
  const { mod, name, kind, line, typeHint } = ctx;
  const code = mod.code;
  const record = newRecord(name, kind, line);
  const param = fnPath.node.params[0];

  const typeNode = param?.typeAnnotation?.typeAnnotation ?? (param?.type === 'AssignmentPattern' ? param.left.typeAnnotation?.typeAnnotation : undefined) ?? typeHint;
  const members = typeMembers(typeNode, mod);
  const destructured = new Map();
  const accessed = new Set();
  const pattern = param?.type === 'AssignmentPattern' ? param.left : param;
  if (pattern?.type === 'ObjectPattern') {
    for (const p of pattern.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const key = p.key.name ?? p.key.value;
      if (p.value.type === 'AssignmentPattern') destructured.set(key, text(code, p.value.right));
      else accessed.add(key);
    }
  } else if (pattern?.type === 'Identifier' && members.size === 0) {
    const propsName = pattern.name;
    fnPath.traverse({
      MemberExpression(p) {
        if (p.node.object.type === 'Identifier' && p.node.object.name === propsName && !p.node.computed) accessed.add(p.node.property.name);
      },
    });
  }
  const statics = mod.statics.get(name) ?? {};
  record.props = buildProps({
    members,
    destructured,
    accessed,
    propTypes: propTypesOf(statics.propTypes, mod),
    defaults: defaultsOf(statics.defaultProps, mod),
  });

  fnPath.traverse({
    CallExpression(p) {
      // Solid createSignal/createStore/createMemo and Qwik useSignal/useStore/useComputed$ hold component state.
      const signal = SIGNALS[memberText(p.node.callee)];
      if (signal) {
        const id = p.parentPath.isVariableDeclarator() ? p.parent.id : null;
        const [valueId, setterId] = id?.type === 'ArrayPattern' ? id.elements : [id];
        if (valueId?.type === 'Identifier') {
          record.state[valueId.name] = { source: signal, ...(signal === 'signal' && p.node.arguments[0] && { initial: text(code, p.node.arguments[0]) }), ...(setterId?.type === 'Identifier' && { setter: setterId.name }) };
        }
      }
      const hook = hookName(p.node.callee);
      if (!hook) return;
      record.hooks.set(hook, (record.hooks.get(hook) ?? 0) + 1);
      const decl = p.parentPath.isVariableDeclarator() ? p.parent.id : null;
      const args = p.node.arguments;

      if (hook === 'useState' || hook === 'useReducer') {
        const [valueId, setterId] = decl?.type === 'ArrayPattern' ? decl.elements : [decl];
        const stateName = valueId?.type === 'Identifier' ? valueId.name : `state${Object.keys(record.state).length || ''}`;
        const entry = { source: hook };
        const initNode = hook === 'useState' ? args[0] : args[1];
        if (initNode) entry.initial = text(code, initNode);
        if (setterId?.type === 'Identifier') entry.setter = setterId.name;
        const typeParam = p.node.typeParameters?.params?.[0] ?? p.node.typeArguments?.params?.[0];
        if (typeParam) entry.type = text(code, typeParam);
        if (hook === 'useReducer' && args[0]) entry.reducer = text(code, args[0]);
        record.state[stateName] = entry;
      } else if (hook === 'useContext' || hook === 'use') {
        const ctxName = memberText(args[0]);
        if (ctxName && (hook === 'useContext' || /Context$/.test(ctxName))) record.context.push(ctxName);
      } else if (hook === 'useRef' && decl?.type === 'Identifier') {
        record.refs.push(decl.name);
      } else if (EFFECT_HOOKS.has(hook)) {
        record.lifecycle.push(effectEvent(p, hook, code));
      }
    },
  });

  addJsx(record, fnPath, code);
  return finish(record);
}

function effectEvent(callPath, hook, code) {
  const [cb, depsNode] = callPath.node.arguments;
  const event = { via: hook, phases: ['mount'] };
  if (!depsNode) event.phases.push('update');
  else if (depsNode.type === 'ArrayExpression') {
    event.deps = depsNode.elements.map((e) => text(code, e, 40));
    if (event.deps.length) event.phases.push('update');
  } else {
    event.deps = [text(code, depsNode, 40)];
    event.phases.push('update');
  }

  let cleanupNode = null;
  let cleanupCalls = [];
  const cbPath = callPath.get('arguments.0');
  if (cb && (cb.type === 'ArrowFunctionExpression' || cb.type === 'FunctionExpression') && cb.body.type === 'BlockStatement') {
    cbPath.traverse({
      Function(p) {
        p.skip();
      },
      ReturnStatement(p) {
        const arg = p.node.argument;
        if (!arg) return;
        if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') {
          cleanupNode = arg;
          cleanupCalls = collectCalls(p.get('argument'));
          if (arg.body.type !== 'BlockStatement') {
            const label = arg.body.type === 'CallExpression' ? calleeLabel(arg.body.callee) : null;
            if (label && !cleanupCalls.includes(label)) cleanupCalls.unshift(label);
          }
        } else if (arg.type === 'Identifier') {
          cleanupNode = arg;
          cleanupCalls = [arg.name];
        }
      },
    });
  }
  const calls = cbPath.node ? collectCalls(cbPath, cleanupNode) : [];
  if (calls.length) event.calls = calls;
  if (cleanupNode) {
    event.phases.push('unmount');
    event.cleanup = cleanupCalls;
  }
  event.line = callPath.node.loc?.start.line;
  return event;
}

export function isReactClass(superClass) {
  const name = memberText(superClass);
  return !!name && /^(React\.)?(Pure)?Component$/.test(name);
}

export function extractClassComponent(classPath, ctx) {
  const { mod, name, line } = ctx;
  const code = mod.code;
  const node = classPath.node;
  const record = newRecord(name, 'class', line);
  const [propsType, stateType] = node.superTypeParameters?.params ?? node.superTypeArguments?.params ?? [];
  const stateMembers = typeMembers(stateType, mod);
  const statics = { ...(mod.statics.get(name) ?? {}) };
  const accessed = new Set();

  const addStateObject = (obj) => {
    if (obj?.type !== 'ObjectExpression') return;
    for (const p of obj.properties) {
      if (p.type !== 'ObjectProperty') continue;
      const key = p.key.name ?? p.key.value;
      const entry = { source: 'class', initial: text(code, p.value), setter: 'this.setState' };
      if (stateMembers.get(key)) entry.type = stateMembers.get(key).type;
      record.state[key] = entry;
    }
  };

  for (const memberPath of classPath.get('body.body')) {
    const m = memberPath.node;
    const key = m.key?.name;
    if ((m.type === 'ClassProperty' || m.type === 'PropertyDefinition') && m.static) {
      if (key === 'propTypes' || key === 'defaultProps') statics[key] = m.value;
      if (key === 'contextType') record.context.push(memberText(m.value));
    } else if (m.type === 'ClassProperty' || m.type === 'PropertyDefinition') {
      if (key === 'state') addStateObject(m.value);
      else if (m.value?.type === 'CallExpression' && /createRef$/.test(memberText(m.value.callee) ?? '')) record.refs.push(key);
    } else if (m.type === 'ClassMethod' && CLASS_LIFECYCLE[key]) {
      const event = { via: key, phases: CLASS_LIFECYCLE[key] };
      if (key === 'constructor') {
        memberPath.traverse({
          AssignmentExpression(p) {
            const target = memberText(p.node.left);
            if (target === 'this.state') addStateObject(p.node.right);
            else if (target?.startsWith('this.') && p.node.right.type === 'CallExpression' && /createRef$/.test(memberText(p.node.right.callee) ?? '')) {
              record.refs.push(target.slice(5));
            }
          },
        });
      }
      event.calls = collectCalls(memberPath).filter((c) => c !== 'super');
      if (!event.calls.length) delete event.calls;
      event.line = m.loc?.start.line;
      record.lifecycle.push(event);
    }
  }

  classPath.traverse({
    MemberExpression(p) {
      if (memberText(p.node.object) === 'this.props' && !p.node.computed) accessed.add(p.node.property.name);
    },
    VariableDeclarator(p) {
      if (p.node.id.type === 'ObjectPattern' && memberText(p.node.init) === 'this.props') {
        p.node.id.properties.forEach((prop) => prop.type === 'ObjectProperty' && accessed.add(prop.key.name));
      }
    },
  });

  const members = typeMembers(propsType, mod);
  record.props = buildProps({
    members,
    destructured: new Map(),
    accessed: members.size ? [] : accessed,
    propTypes: propTypesOf(statics.propTypes, mod),
    defaults: defaultsOf(statics.defaultProps, mod),
  });
  addJsx(record, classPath, code);
  return finish(record);
}
