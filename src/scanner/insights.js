import { collectCalls, EFFECT_HOOKS, hookName, memberText, text } from './component.js';

/*
 * Deep, per-component analysis on top of the basic extraction in component.js:
 * variables, inner functions, timers/listeners/subscriptions (and whether they are released),
 * API calls, global-state reads/writes, validation rules, CSS classes, props passed to children,
 * and diagnostics (memory leaks, unsafe async updates, render loops, stale deps, dead code).
 */

const MAX_ITEMS = 60;
const TIMERS = { setInterval: 'interval', setTimeout: 'timeout', requestAnimationFrame: 'animation-frame', requestIdleCallback: 'idle-callback' };
const RELEASES = { clearInterval: 'interval', clearTimeout: 'timeout', cancelAnimationFrame: 'animation-frame', cancelIdleCallback: 'idle-callback' };
const OBSERVER = /^(ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver)$/;
const SOCKET = /^(WebSocket|EventSource|BroadcastChannel|Worker|SharedWorker)$/;
const SUBSCRIBE = /^(subscribe|onSnapshot|onAuthStateChanged|onIdTokenChanged|listen|on|addListener|watch)$/;
const UNSUBSCRIBE = /^(unsubscribe|off|removeListener|removeAllListeners|unwatch|unlisten)$/;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'request']);
export const API_MODULE = /(^|[/@])(api|apis|services?|http|client|requests?|fetchers?)(\/|\.|$)|axios|ky$|ofetch/i;
const HTTP_CLIENT = /^(axios|http|api|client|request|ky|\$fetch|instance)$/i;
const DATA_HOOKS = { useSWR: 'useSWR', useSWRInfinite: 'useSWR', useSWRMutation: 'useSWR', useQuery: 'useQuery', useInfiniteQuery: 'useQuery', useSuspenseQuery: 'useQuery', useMutation: 'useMutation' };
const SELECTOR_HOOKS = /^use(App|Typed)?Selector$/;
const DISPATCH_HOOKS = /^use(App|Typed)?Dispatch$/;
const VALIDATE_CALL = /^(safeParse|parse|parseAsync|safeParseAsync|validate|validateSync|isValid|isValidSync)$/;
const CLASS_HELPERS = /^(clsx|cn|classnames|classNames|cx|twMerge|tw)$/;
const RULE_ATTRS = ['required', 'pattern', 'minLength', 'maxLength', 'min', 'max', 'step'];
const TYPE_RULES = new Set(['email', 'url', 'number', 'tel', 'date']);
const FIELD_TAGS = /^(input|textarea|select|Input|TextField|Textarea|Select|Checkbox|FormField)$/;

const lineOf = (node) => node?.loc?.start.line;
const issue = (type, severity, message, line, fix) => ({ type, severity, message, ...(line && { line }), ...(fix && { fix }) });
const uniqBy = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = key(x);
    return seen.has(k) ? false : (seen.add(k), true);
  });
};

function stringValue(node, code) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') return text(code, node, 120).slice(1, -1);
  return text(code, node, 80);
}

/** Member chains rooted at `param` inside a selector, e.g. (s) => s.cart.items → ["cart.items"]. */
function statePaths(fnNode, path) {
  const param = fnNode?.params?.[0];
  if (param?.type !== 'Identifier') return [];
  const out = new Set();
  path.traverse({
    MemberExpression(p) {
      if (p.parentPath.isMemberExpression({ object: p.node })) return;
      const full = memberText(p.node);
      if (full?.startsWith(param.name + '.')) out.add(full.slice(param.name.length + 1).replace(/\.(length|map|filter|find|some|reduce)$/, ''));
    },
  });
  return [...out];
}

/** Where a node sits: inside which effect / lifecycle method / handler, or directly in render. */
function locate(p, effects, rootPath) {
  let handler = null;
  let inline = false;
  // Climb outwards; an enclosing effect wins over any callback nested inside it (e.g. a setTimeout callback in an effect).
  for (let a = p.parentPath; a && a.node !== rootPath.node; a = a.parentPath) {
    const effect = effects.find((e) => e.cbNode === a.node);
    if (effect) return { label: effect.label, effect };
    if (a.isClassMethod() || a.isClassProperty()) return { label: a.node.key.name, method: a.node.key.name };
    if (a.isFunction() && !handler && !inline) {
      const owner = a.parentPath.isVariableDeclarator() && a.parentPath.node.id.type === 'Identifier' ? a.parentPath.node.id.name : a.isFunctionDeclaration() ? a.node.id?.name : null;
      if (owner) handler = owner;
      else inline = true;
    }
  }
  if (handler) return { label: `handler ${handler}`, handler };
  if (inline) return { label: 'inline callback', handler: '(inline)' };
  return { label: 'render', render: true };
}

function resourceOf(p, code) {
  const n = p.node;
  if (p.isNewExpression()) {
    const name = memberText(n.callee) ?? '';
    if (OBSERVER.test(name)) return { type: 'observer', label: `new ${name}` };
    if (SOCKET.test(name)) return { type: 'socket', label: `new ${name}` };
    if (name === 'AbortController') return { type: 'abort-controller', label: 'new AbortController' };
    return null;
  }
  const full = memberText(n.callee) ?? '';
  const bare = full.replace(/^(window|globalThis|self)\./, '');
  if (TIMERS[bare]) return { type: TIMERS[bare], label: full };
  const last = n.callee.type === 'MemberExpression' && n.callee.property.type === 'Identifier' ? n.callee.property.name : '';
  if (last === 'addEventListener') return { type: 'listener', label: full || '.addEventListener', event: stringValue(n.arguments[0], code), target: text(code, n.callee.object, 30) };
  if (n.callee.type === 'MemberExpression' && SUBSCRIBE.test(last) && n.arguments.some((a) => a.type.includes('Function') || a.type === 'Identifier')) {
    const holder = p.parentPath.isVariableDeclarator() ? p.parentPath.node.id.name : undefined;
    const returned = p.parentPath.isReturnStatement() || (p.parentPath.isArrowFunctionExpression() && p.parentPath.node.body === n);
    return { type: 'subscription', label: full || `.${last}`, holder, returned, event: n.arguments[0]?.type === 'StringLiteral' ? n.arguments[0].value : undefined };
  }
  return null;
}

function releasesIn(path, holders) {
  const out = [];
  if (!path?.node) return out;
  const visit = (p) => {
    const n = p.node;
    const full = memberText(n.callee) ?? '';
    const bare = full.replace(/^(window|globalThis|self)\./, '');
    const last = n.callee.type === 'MemberExpression' && n.callee.property.type === 'Identifier' ? n.callee.property.name : '';
    if (RELEASES[bare]) out.push({ type: RELEASES[bare] });
    else if (last === 'removeEventListener') out.push({ type: 'listener', event: n.arguments[0]?.type === 'StringLiteral' ? n.arguments[0].value : undefined });
    else if (last === 'disconnect' || last === 'unobserve') out.push({ type: 'observer' });
    else if (last === 'close' || last === 'terminate') out.push({ type: 'socket' });
    else if (last === 'abort') out.push({ type: 'abort-controller' });
    else if (UNSUBSCRIBE.test(last)) out.push({ type: 'subscription' });
    else if (n.callee.type === 'Identifier' && holders.has(n.callee.name)) out.push({ type: 'subscription', holder: n.callee.name });
  };
  if (path.isCallExpression()) visit(path);
  path.traverse({ CallExpression: visit });
  return out;
}

const released = (res, releases) =>
  releases.some((r) => {
    if (r.type !== res.type) return false;
    if (res.type === 'listener') return !r.event || !res.event || r.event === res.event;
    if (res.type === 'subscription' && r.holder) return r.holder === res.holder;
    return true;
  });

const LEAK_SEVERITY = { interval: 'high', listener: 'high', subscription: 'high', observer: 'high', socket: 'high', timeout: 'medium', 'animation-frame': 'medium', 'idle-callback': 'low' };
const RELEASE_FIX = {
  interval: 'return () => clearInterval(id) from the effect',
  timeout: 'return () => clearTimeout(id) from the effect',
  'animation-frame': 'return () => cancelAnimationFrame(id) from the effect',
  'idle-callback': 'return () => cancelIdleCallback(id) from the effect',
  listener: 'return () => target.removeEventListener(sameEvent, sameHandler) from the effect',
  subscription: 'keep the unsubscribe function and call it in the effect cleanup',
  observer: 'call observer.disconnect() in the effect cleanup',
  socket: 'call .close() in the effect cleanup',
};

/** Effects (function components) or lifecycle methods (classes) with their cleanup regions. */
function effectRegions(rootPath, isClass, code) {
  const regions = [];
  if (isClass) {
    const methods = Object.fromEntries(rootPath.get('body.body').filter((m) => m.isClassMethod()).map((m) => [m.node.key.name, m]));
    for (const name of ['constructor', 'componentDidMount', 'componentDidUpdate']) {
      if (methods[name]) regions.push({ label: name, cbNode: methods[name].node, cbPath: methods[name], cleanups: methods.componentWillUnmount ? [methods.componentWillUnmount] : [], deps: undefined, isMethod: true });
    }
    return regions;
  }
  rootPath.traverse({
    CallExpression(p) {
      const hook = hookName(p.node.callee);
      if (!EFFECT_HOOKS.has(hook)) return;
      const cbPath = p.get('arguments.0');
      if (!cbPath.node || !cbPath.isFunction()) return;
      const depsNode = p.node.arguments[1];
      const cleanups = [];
      let returnsHolder = null;
      if (cbPath.node.body.type === 'BlockStatement') {
        cbPath.traverse({
          Function(q) {
            q.skip();
          },
          ReturnStatement(q) {
            const arg = q.get('argument');
            if (!arg.node) return;
            if (arg.isFunction() || arg.isCallExpression()) cleanups.push(arg);
            else if (arg.isIdentifier()) returnsHolder = arg.node.name;
          },
        });
      } else cleanups.push(cbPath.get('body'));
      regions.push({
        label: `${hook} L${lineOf(p.node)}`,
        hook,
        cbNode: cbPath.node,
        cbPath,
        cleanups,
        returnsHolder,
        deps: depsNode?.type === 'ArrayExpression' ? depsNode.elements.map((e) => text(code, e, 60)) : depsNode ? [text(code, depsNode, 60)] : undefined,
        line: lineOf(p.node),
      });
    },
  });
  return regions;
}

/**
 * Analyses one component. `rootPath` is the component function or class; `record` is mutated with the new fields.
 * `mod` carries module-level facts (imports, schemas, CSS-module imports, redux connect wiring).
 */
export function analyzeComponent(rootPath, record, mod, { isClass = false } = {}) {
  const code = mod.code;
  const issues = [];
  const regions = effectRegions(rootPath, isClass, code);
  const setters = new Set(Object.values(record.state ?? {}).map((s) => s.setter).filter(Boolean));
  const stateNames = new Set(Object.keys(record.state ?? {}));

  // ---------- timers, listeners, subscriptions ----------
  const timers = [];
  const handlerResources = [];
  rootPath.traverse({
    'CallExpression|NewExpression'(p) {
      const res = resourceOf(p, code);
      if (!res || res.type === 'abort-controller') return;
      const where = locate(p, regions, rootPath);
      const region = where.effect ?? regions.find((r) => r.isMethod && r.label === where.method);
      const entry = { type: res.type, call: res.label, ...(res.event && { event: res.event }), in: where.label, line: lineOf(p.node) };
      if (region) {
        // A cleanup region belongs to the same effect, so resources created there are releases, not leaks.
        if (region.cleanups.some((c) => c.node === p.node || p.findParent((x) => x.node === c.node))) return;
        const holders = new Set([res.holder].filter(Boolean));
        const rel = region.cleanups.flatMap((c) => releasesIn(c, holders));
        const ok = released(res, rel) || (res.type === 'subscription' && (res.returned || (res.holder && region.returnsHolder === res.holder)));
        entry.cleared = ok;
        if (!ok) {
          const where2 = region.isMethod ? `${region.label} with no matching release in componentWillUnmount` : `${region.label} without cleanup`;
          issues.push(issue('memory-leak', LEAK_SEVERITY[res.type], `${res.label}${res.event ? `('${res.event}')` : ''} started in ${where2}`, entry.line, region.isMethod ? `release it in componentWillUnmount` : RELEASE_FIX[res.type]));
        }
      } else if (where.render) {
        entry.cleared = false;
        issues.push(issue('side-effect-in-render', 'high', `${res.label} runs during render, so it starts again on every render`, entry.line, 'move it into useEffect with a cleanup'));
      } else {
        entry.cleared = res.type === 'timeout' ? null : undefined;
        handlerResources.push(entry);
      }
      timers.push(entry);
    },
  });
  if (handlerResources.length) {
    const allReleases = releasesIn(rootPath, new Set());
    for (const h of handlerResources) {
      if (h.type === 'timeout') continue;
      h.cleared = released(h, allReleases);
      if (!h.cleared) issues.push(issue('memory-leak', 'medium', `${h.call} started in ${h.in} is never released anywhere in the component`, h.line, 'store the id/handle in a ref and release it on unmount'));
    }
  }

  // ---------- effect-level diagnostics ----------
  const scope = rootPath.scope;
  for (const r of regions) {
    if (r.isMethod) continue;
    const setterCalls = [];
    let asyncWork = false;
    let aborted = false;
    r.cbPath.traverse({
      CallExpression(p) {
        const name = memberText(p.node.callee);
        if (name && setters.has(name)) setterCalls.push(p);
        const last = p.node.callee.type === 'MemberExpression' ? p.node.callee.property.name : '';
        if (name === 'fetch' || last === 'then' || HTTP_METHODS.has(last)) asyncWork = true;
        if (last === 'abort') aborted = true;
      },
      AwaitExpression() {
        asyncWork = true;
      },
    });
    if (asyncWork && setterCalls.length && !r.cleanups.length && !aborted) {
      issues.push(issue('unsafe-async-update', 'medium', `${r.label} sets state (${[...new Set(setterCalls.map((s) => memberText(s.node.callee)))].join(', ')}) after async work with no cleanup; it can run after unmount or out of order`, r.line, 'use an AbortController or an `ignore` flag set in the cleanup'));
    }
    if (!r.deps) {
      // A setter called unconditionally in an effect with no deps array re-renders forever.
      const direct = setterCalls.find((s) => s.getFunctionParent()?.node === r.cbNode && !s.findParent((x) => x.isIfStatement() || x.isConditionalExpression() || x.isLogicalExpression()));
      if (direct) issues.push(issue('render-loop', 'high', `${r.label} has no dependency array and calls ${memberText(direct.node.callee)} unconditionally: infinite re-render loop`, r.line, 'add a dependency array or guard the update'));
    } else {
      const depRoots = new Set(r.deps.map((d) => d.split(/[.?[(]/)[0]));
      const missing = new Set();
      r.cbPath.traverse({
        Identifier(p) {
          if (!p.isReferencedIdentifier()) return;
          const name = p.node.name;
          const binding = p.scope.getBinding(name);
          if (!binding || binding.scope !== scope || depRoots.has(name) || setters.has(name)) return;
          const decl = binding.path.isVariableDeclarator() ? binding.path.node : null;
          const hook = decl?.init?.type === 'CallExpression' ? hookName(decl.init.callee) : null;
          // Refs, dispatchers and the 2nd+ element of hook tuples (setters, dispatch, startTransition) are stable identities.
          const tupleIndex = decl?.id.type === 'ArrayPattern' ? decl.id.elements.findIndex((e) => e?.name === name) : -1;
          if (hook === 'useRef' || DISPATCH_HOOKS.test(hook ?? '') || (hook && tupleIndex >= 1)) return;
          if (['param', 'const', 'let', 'hoisted'].includes(binding.kind)) missing.add(name);
        },
      });
      if (missing.size) issues.push(issue('missing-dependency', 'low', `${r.label} reads ${[...missing].join(', ')} but its dependency array is [${r.deps.join(', ')}]: stale values possible`, r.line, `add ${[...missing].join(', ')} to the dependency array`));
    }
  }

  // ---------- variables & functions (function components) ----------
  const variables = [];
  const functions = [];
  if (!isClass) {
    for (const [name, binding] of Object.entries(scope.bindings)) {
      const bp = binding.path;
      const line = lineOf(bp.node);
      if (binding.kind === 'param') {
        const first = rootPath.node.params[0];
        const pattern = first?.type === 'AssignmentPattern' ? first.left : first;
        const isProp = pattern?.type === 'ObjectPattern' && pattern.properties.some((x) => (x.value?.type === 'AssignmentPattern' ? x.value.left : x.value)?.name === name);
        if (!binding.referenced && isProp && !name.startsWith('_')) issues.push(issue('unused-prop', 'low', `prop \`${name}\` is destructured but never used`, lineOf(binding.identifier), 'remove it from the props or use it'));
        continue;
      }
      if (bp.isFunctionDeclaration()) {
        functions.push(fnEntry(name, bp, binding));
        continue;
      }
      if (!bp.isVariableDeclarator()) continue;
      const init = bp.node.init;
      const hook = init?.type === 'CallExpression' ? hookName(init.callee) : null;
      if (hook === 'useCallback' && bp.node.id.type === 'Identifier' && bp.get('init.arguments.0').isFunction?.()) {
        functions.push({ ...fnEntry(name, bp.get('init.arguments.0'), binding), memoized: true });
        continue;
      }
      if (hook === 'useMemo' && bp.node.id.type === 'Identifier') {
        variables.push({ name, kind: 'memo', value: text(code, init.arguments[0]?.body ?? init.arguments[0], 70), line, used: binding.referenced });
        if (!binding.referenced) issues.push(issue('unused-variable', 'low', `\`${name}\` (useMemo) is computed but never used`, line, 'remove it'));
        continue;
      }
      if (hook) {
        if (!binding.referenced) {
          const isSetter = setters.has(name);
          if (isSetter) issues.push(issue('state-never-updated', 'info', `\`${name}\` is never called, so this state never changes`, line, 'replace the state with a constant'));
          else if (hook === 'useState' || hook === 'useReducer') issues.push(issue('unused-state', 'low', `state \`${name}\` is declared but never read`, line));
          else issues.push(issue('unused-variable', 'low', `\`${name}\` (from ${hook}) is never used`, line));
        }
        continue;
      }
      if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
        functions.push(fnEntry(name, bp.get('init'), binding));
        continue;
      }
      const kind = bp.parentPath.node.kind;
      const destructured = bp.node.id.type !== 'Identifier';
      variables.push({ name, kind, ...(init && { value: destructured ? `from ${text(code, init, 40)}` : text(code, init, 70) }), line, used: binding.referenced });
      if (!binding.referenced) issues.push(issue('unused-variable', 'low', `\`${name}\` is declared but never used`, line, 'remove it'));
    }
  } else {
    for (const m of rootPath.get('body.body')) {
      const n = m.node;
      const name = n.key?.name;
      if (!name || n.static) continue;
      if (m.isClassMethod() && n.kind === 'method' && !['render', ...Object.keys(TIMERS)].includes(name) && !/^(component|UNSAFE_|getSnapshot|shouldComponent|getDerived)/.test(name)) {
        const used = new RegExp(`this\\.${name}\\b`).test(code);
        functions.push({ name, line: lineOf(n), kind: /^(handle|on)[A-Z]/.test(name) ? 'handler' : 'method', async: !!n.async, params: n.params.map((x) => text(code, x, 30)).join(', '), calls: collectCalls(m), used });
        if (!used) issues.push(issue('unused-function', 'low', `method \`${name}\` is never called`, lineOf(n)));
      } else if ((m.isClassProperty() || m.isClassPrivateProperty?.()) && name !== 'state') {
        if (n.value && (n.value.type === 'ArrowFunctionExpression' || n.value.type === 'FunctionExpression')) {
          const used = new RegExp(`this\\.${name}\\b`).test(code);
          functions.push({ name, line: lineOf(n), kind: /^(handle|on)[A-Z]/.test(name) ? 'handler' : 'method', async: !!n.value.async, params: n.value.params.map((x) => text(code, x, 30)).join(', '), calls: collectCalls(m.get('value')), used });
          if (!used) issues.push(issue('unused-function', 'low', `\`${name}\` is never called`, lineOf(n)));
        } else variables.push({ name, kind: 'field', ...(n.value && { value: text(code, n.value, 70) }), line: lineOf(n), used: true });
      }
    }
  }

  function fnEntry(name, fnPath, binding) {
    const calls = collectCalls(fnPath);
    return {
      name,
      line: lineOf(fnPath.node),
      kind: /^(handle|on)[A-Z]/.test(name) ? 'handler' : 'helper',
      async: !!fnPath.node.async,
      params: fnPath.node.params.map((x) => text(code, x, 30)).join(', '),
      ...(calls.length && { calls }),
      ...(calls.some((c) => setters.has(c)) && { sets: calls.filter((c) => setters.has(c)).map((s) => [...Object.entries(record.state)].find(([, v]) => v.setter === s)?.[0] ?? s) }),
      used: binding.referenced,
    };
  }
  for (const f of functions) if (!isClass && f.used === false) issues.push(issue('unused-function', 'low', `\`${f.name}\` is declared but never called`, f.line, 'remove it'));

  // ---------- API calls ----------
  const apiCalls = [];
  const pushApi = (p, entry) => void apiCalls.push({ ...entry, in: locate(p, regions, rootPath).label, line: lineOf(p.node) });
  rootPath.traverse({
    CallExpression(p) {
      const n = p.node;
      const callee = memberText(n.callee) ?? '';
      const hook = hookName(n.callee);
      if (callee === 'fetch' || callee === 'window.fetch') {
        const opts = n.arguments[1];
        const methodProp = opts?.type === 'ObjectExpression' ? opts.properties.find((x) => x.key?.name === 'method') : null;
        return pushApi(p, { via: 'fetch', method: (methodProp?.value.value ?? 'GET').toUpperCase(), target: stringValue(n.arguments[0], code) });
      }
      if (hook && DATA_HOOKS[hook]) {
        const arg = n.arguments[0];
        const key = arg?.type === 'ObjectExpression' ? arg.properties.find((x) => x.key?.name === 'queryKey' || x.key?.name === 'mutationKey')?.value : arg;
        return pushApi(p, { via: hook, method: hook === 'useMutation' || hook === 'useSWRMutation' ? 'MUTATE' : 'GET', target: stringValue(key, code) ?? '(dynamic)' });
      }
      if (n.callee.type === 'MemberExpression' && n.callee.property.type === 'Identifier' && HTTP_METHODS.has(n.callee.property.name)) {
        const obj = memberText(n.callee.object) ?? '';
        const imp = mod.imports.get(obj.split('.')[0]);
        if (HTTP_CLIENT.test(obj) || (imp && API_MODULE.test(imp.source))) {
          return pushApi(p, { via: `${obj}.${n.callee.property.name}`, method: n.callee.property.name.toUpperCase(), target: stringValue(n.arguments[0], code) ?? '(dynamic)' });
        }
      }
      if (n.callee.type === 'Identifier') {
        const imp = mod.imports.get(n.callee.name);
        if (imp && API_MODULE.test(imp.source) && !/^use[A-Z]/.test(n.callee.name)) return pushApi(p, { via: 'service', method: 'CALL', target: `${n.callee.name}()`, module: imp.source });
      }
    },
  });

  // ---------- global state: redux / zustand / context ----------
  const reads = [];
  const writes = [];
  const dispatchers = new Set();
  rootPath.traverse({
    CallExpression(p) {
      const n = p.node;
      const hook = hookName(n.callee);
      if (hook && SELECTOR_HOOKS.test(hook)) {
        const fn = n.arguments[0];
        const paths = fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') ? statePaths(fn, p.get('arguments.0')) : [text(code, fn, 50)];
        paths.forEach((sp) => reads.push({ via: hook, kind: 'redux', path: sp, line: lineOf(n) }));
      } else if (hook && DISPATCH_HOOKS.test(hook) && p.parentPath.isVariableDeclarator()) {
        dispatchers.add(p.parentPath.node.id.name);
      } else if (hook && /^use\w*Store$/.test(hook) && hook !== 'useStore') {
        const fn = n.arguments[0];
        const paths = fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') ? statePaths(fn, p.get('arguments.0')) : ['(whole store)'];
        paths.forEach((sp) => reads.push({ via: hook, kind: 'zustand', store: hook, path: sp, line: lineOf(n) }));
      } else if (hook === 'useContext' || hook === 'use') {
        const ctx = memberText(n.arguments[0]);
        if (ctx) reads.push({ via: hook, kind: 'context', store: ctx, line: lineOf(n) });
      }
    },
  });
  rootPath.traverse({
    CallExpression(p) {
      const n = p.node;
      const callee = memberText(n.callee) ?? '';
      if (!dispatchers.has(callee) && callee !== 'this.props.dispatch' && callee !== 'store.dispatch') return;
      const arg = n.arguments[0];
      const action =
        arg?.type === 'CallExpression'
          ? (memberText(arg.callee) ?? '').split('.').pop()
          : arg?.type === 'ObjectExpression'
            ? arg.properties.find((x) => x.key?.name === 'type')?.value?.value
            : memberText(arg);
      if (action) writes.push({ via: 'dispatch', kind: 'redux', action, in: locate(p, regions, rootPath).label, line: lineOf(n) });
    },
  });
  const conn = mod.connects?.[record.name];
  if (conn) {
    conn.reads.forEach((sp) => reads.push({ via: 'connect', kind: 'redux', path: sp, line: conn.line }));
    conn.writes.forEach((a) => writes.push({ via: 'connect', kind: 'redux', action: a, line: conn.line }));
  }
  if (isClass && record.context?.length) record.context.forEach((ctx) => reads.push({ via: 'contextType', kind: 'context', store: ctx }));

  // ---------- validation ----------
  const validation = [];
  rootPath.traverse({
    CallExpression(p) {
      const n = p.node;
      const hook = hookName(n.callee);
      if (hook === 'useForm') {
        const resolver = n.arguments[0]?.type === 'ObjectExpression' ? n.arguments[0].properties.find((x) => x.key?.name === 'resolver') : null;
        const schemaName = resolver?.value?.arguments?.[0]?.type === 'Identifier' ? resolver.value.arguments[0].name : undefined;
        if (schemaName) validation.push({ via: `${mod.schemas?.[schemaName]?.lib ?? 'schema'} resolver`, schema: schemaName, rules: mod.schemas?.[schemaName]?.fields ?? [], line: lineOf(n) });
        return;
      }
      if (n.callee.type === 'Identifier' && n.callee.name === 'register' && n.arguments[0]) {
        const rules = n.arguments[1]?.type === 'ObjectExpression' ? n.arguments[1].properties.map((x) => x.key?.name).filter(Boolean) : [];
        validation.push({ via: 'react-hook-form', field: stringValue(n.arguments[0], code), rules, line: lineOf(n) });
        return;
      }
      if (n.callee.type === 'MemberExpression' && VALIDATE_CALL.test(n.callee.property.name ?? '')) {
        const obj = memberText(n.callee.object);
        const schema = obj && mod.schemas?.[obj];
        if (schema) validation.push({ via: schema.lib, schema: obj, rules: schema.fields, line: lineOf(n) });
        // Imported schema: resolved to its definition when files are linked (graph.js).
        else if (obj && mod.imports.has(obj)) validation.push({ via: 'schema', schema: obj, line: lineOf(n) });
      }
      if (n.callee.type === 'Identifier' && /^(validate|isValid)[A-Z]/.test(n.callee.name) && mod.imports.has(n.callee.name)) {
        validation.push({ via: 'custom', fn: n.callee.name, line: lineOf(n) });
      }
    },
    JSXOpeningElement(p) {
      const tag = p.node.name.type === 'JSXIdentifier' ? p.node.name.name : '';
      if (!FIELD_TAGS.test(tag)) return;
      const attrs = Object.fromEntries(p.node.attributes.filter((a) => a.type === 'JSXAttribute').map((a) => [a.name.name, a.value]));
      const rules = RULE_ATTRS.filter((r) => r in attrs);
      if (attrs.type?.type === 'StringLiteral' && TYPE_RULES.has(attrs.type.value)) rules.push(`type=${attrs.type.value}`);
      if (!rules.length) return;
      const field = ['name', 'id', 'label', 'placeholder'].map((k) => attrs[k]).find((v) => v?.type === 'StringLiteral')?.value ?? tag;
      validation.push({ via: 'html', field, rules, line: lineOf(p.node) });
    },
  });
  for (const f of functions) {
    if (/^(validate|isValid|check)[A-Z]?/.test(f.name)) validation.push({ via: 'custom', fn: f.name, line: f.line });
  }

  // ---------- styles ----------
  const classes = new Set();
  const moduleClasses = new Map();
  const styleModules = mod.styleModules ?? {};
  const collectClassNames = (node) => {
    if (!node) return;
    switch (node.type) {
      case 'StringLiteral':
        node.value.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        break;
      case 'TemplateLiteral':
        node.quasis.forEach((q) => q.value.cooked.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)));
        node.expressions.forEach(collectClassNames);
        break;
      case 'ConditionalExpression':
        collectClassNames(node.consequent);
        collectClassNames(node.alternate);
        break;
      case 'LogicalExpression':
        collectClassNames(node.right);
        break;
      case 'ArrayExpression':
        node.elements.forEach(collectClassNames);
        break;
      case 'ObjectExpression':
        node.properties.forEach((x) => (x.computed ? collectClassNames(x.key) : x.key?.name ? classes.add(x.key.name) : x.key?.value && classes.add(x.key.value)));
        break;
      case 'CallExpression':
        if (CLASS_HELPERS.test(memberText(node.callee) ?? '') || memberText(node.callee)?.endsWith('.join')) node.arguments.forEach(collectClassNames);
        break;
      case 'MemberExpression': {
        const obj = memberText(node.object);
        if (obj && styleModules[obj]) {
          const key = node.computed ? node.property.value : node.property.name;
          if (key) (moduleClasses.get(obj) ?? moduleClasses.set(obj, new Set()).get(obj)).add(key);
        }
        break;
      }
    }
  };
  rootPath.traverse({
    JSXAttribute(p) {
      if (p.node.name.name !== 'className' && p.node.name.name !== 'class') return;
      const v = p.node.value;
      collectClassNames(v?.type === 'JSXExpressionContainer' ? v.expression : v);
    },
  });
  const styles = {};
  if (classes.size) styles.classes = [...classes].filter((c) => /^[\w:/[\].%-]+$/.test(c)).slice(0, MAX_ITEMS);
  if (moduleClasses.size) styles.modules = [...moduleClasses].map(([local, set]) => ({ file: styleModules[local], classes: [...set] }));

  // ---------- props passed to children ----------
  const passes = {};
  for (const j of record.jsx) {
    if (!j.props || j.soft) continue;
    (passes[j.name] ??= []).push(...j.props.map((pr) => ({ ...pr, line: j.line })));
  }

  record.variables = variables.slice(0, MAX_ITEMS);
  record.functions = functions.slice(0, MAX_ITEMS);
  record.timers = timers;
  record.apiCalls = uniqBy(apiCalls, (a) => `${a.via}|${a.target}|${a.in}`);
  record.store = { reads: uniqBy(reads, (r) => `${r.kind}|${r.store}|${r.path}`), writes: uniqBy(writes, (w) => `${w.action}|${w.in}`) };
  record.validation = validation;
  record.styles = styles;
  record.passes = passes;
  record.issues = uniqBy(issues, (i) => `${i.type}|${i.line}|${i.message}`);
  return record;
}

// ---------- module-level facts ----------

/** Zod / Yup schemas, Redux slices & store, contexts, zustand stores, connect() wiring, style imports, unused imports. */
export function analyzeModule(programPath, mod) {
  const code = mod.code;
  mod.schemas = {};
  mod.stores = [];
  mod.connects = {};
  mod.styleImports = [];
  mod.styleModules = {};
  mod.unusedImports = [];
  mod.customHooks = {};

  for (const stmt of programPath.get('body')) {
    const decl = stmt.isExportNamedDeclaration() || stmt.isExportDefaultDeclaration() ? stmt.get('declaration') : stmt;
    if (decl.isFunctionDeclaration() && /^use[A-Z0-9]/.test(decl.node.id?.name ?? '')) mod.customHooks[decl.node.id.name] = hookFacts(decl);
    if (decl.isVariableDeclaration()) {
      for (const d of decl.get('declarations')) {
        const name = d.node.id.name;
        if (/^use[A-Z0-9]/.test(name ?? '') && d.get('init').isFunction()) mod.customHooks[name] = hookFacts(d.get('init'));
      }
    }
    if (stmt.isImportDeclaration()) {
      const source = stmt.node.source.value;
      if (/\.(css|scss|sass|less)$/.test(source)) {
        const local = stmt.node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier')?.local.name;
        mod.styleImports.push({ source, ...(local && { local }), module: /\.module\.\w+$/.test(source) });
        if (local) mod.styleModules[local] = source;
      }
      if (stmt.node.importKind === 'type') continue;
      for (const s of stmt.node.specifiers) {
        if (s.importKind === 'type') continue;
        const binding = stmt.scope.getBinding(s.local.name);
        if (!binding || binding.referenced || s.local.name === 'React') continue;
        // TS type-only usages are invisible to Babel's scope tracker; fall back to a textual check.
        const rest = code.slice(0, stmt.node.start) + code.slice(stmt.node.end);
        if (!new RegExp(`\\b${s.local.name}\\b`).test(rest)) mod.unusedImports.push({ name: s.local.name, source, line: lineOf(stmt.node) });
      }
    }
  }

  programPath.traverse({
    VariableDeclarator(p) {
      const id = p.node.id.type === 'Identifier' ? p.node.id.name : null;
      const init = p.node.init;
      if (!id || !init || init.type !== 'CallExpression') return;
      const callee = memberText(init.callee) ?? '';
      const initText = code.slice(init.start, init.end);
      const schemaLib = /^(z|zod)\./.test(initText) && /\.object\(/.test(initText) ? 'zod' : /^(yup|Yup)\.|^object\(/.test(initText) && /(^|\.)(object|shape)\(/.test(initText) ? 'yup' : null;
      const isCreate = callee === 'create' || (init.callee.type === 'CallExpression' && memberText(init.callee.callee) === 'create');
      if (schemaLib) {
        let fields = [];
        p.get('init').traverse({
          CallExpression(q) {
            const name = memberText(q.node.callee) ?? '';
            if (!fields.length && /(^|\.)(object|shape)$/.test(name) && q.node.arguments[0]?.type === 'ObjectExpression') fields = q.node.arguments[0].properties.map((x) => x.key?.name ?? x.key?.value).filter(Boolean);
          },
        });
        if (!fields.length && init.arguments[0]?.type === 'ObjectExpression') fields = init.arguments[0].properties.map((x) => x.key?.name ?? x.key?.value).filter(Boolean);
        mod.schemas[id] = { lib: schemaLib, fields, line: lineOf(p.node) };
      } else if (callee === 'createSlice') {
        const opts = init.arguments[0];
        if (opts?.type !== 'ObjectExpression') return;
        const prop = (k) => opts.properties.find((x) => x.key?.name === k)?.value;
        const initial = resolveObject(prop('initialState'), programPath);
        mod.stores.push({
          kind: 'redux-slice',
          name: prop('name')?.value ?? id,
          local: id,
          state: initial ? initial.properties.map((x) => x.key?.name ?? x.key?.value).filter(Boolean) : [],
          actions: prop('reducers')?.type === 'ObjectExpression' ? prop('reducers').properties.map((x) => x.key?.name).filter(Boolean) : [],
          line: lineOf(p.node),
        });
      } else if (callee === 'createAsyncThunk') {
        mod.thunks = [...(mod.thunks ?? []), { name: id, type: stringValue(init.arguments[0], code), line: lineOf(p.node) }];
      } else if (callee === 'configureStore') {
        const reducer = init.arguments[0]?.properties?.find((x) => x.key?.name === 'reducer')?.value;
        mod.stores.push({ kind: 'redux-store', name: id, reducers: reducer?.type === 'ObjectExpression' ? reducer.properties.map((x) => ({ key: x.key?.name, value: memberText(x.value) ?? text(code, x.value, 40) })) : [], line: lineOf(p.node) });
      } else if (callee === 'createContext' || callee === 'React.createContext') {
        mod.stores.push({ kind: 'context', name: id, default: text(code, init.arguments[0], 70), line: lineOf(p.node) });
      } else if (isCreate && /^use\w*Store$/.test(id)) {
        // zustand: create((set) => ({ ... })) or the curried TS form create<T>()((set) => ({ ... }))
        let obj = init.arguments[0]?.body;
        if (obj?.type === 'ParenthesizedExpression') obj = obj.expression;
        const props = obj?.type === 'ObjectExpression' ? obj.properties.filter((x) => x.key?.name) : [];
        const isFn = (x) => x.type === 'ObjectMethod' || /Function/.test(x.value?.type ?? '');
        mod.stores.push({ kind: 'zustand', name: id, state: props.filter((x) => !isFn(x)).map((x) => x.key.name), actions: props.filter(isFn).map((x) => x.key.name), line: lineOf(p.node) });
      }
    },
    CallExpression(p) {
      // connect(mapState, mapDispatch)(Component)
      const n = p.node;
      if (n.callee.type !== 'CallExpression' || memberText(n.callee.callee) !== 'connect') return;
      const target = n.arguments[0]?.type === 'Identifier' ? n.arguments[0].name : null;
      if (!target) return;
      const [mapState, mapDispatch] = n.callee.arguments;
      const resolveFn = (node) => (node?.type === 'Identifier' ? findDeclaration(programPath, node.name) : node);
      const ms = resolveFn(mapState);
      const md = resolveFn(mapDispatch);
      const reads = [];
      if (ms && (ms.type === 'ArrowFunctionExpression' || ms.type === 'FunctionExpression' || ms.type === 'FunctionDeclaration')) {
        const param = ms.params[0]?.name;
        const body = code.slice(ms.start, ms.end);
        if (param) for (const m of body.matchAll(new RegExp(`\\b${param}\\.([\\w.]+)`, 'g'))) reads.push(m[1].replace(/\.(length|map|filter)$/, ''));
      }
      let writes = [];
      if (md?.type === 'ObjectExpression') writes = md.properties.map((x) => (x.value?.type === 'Identifier' ? x.value.name : x.key?.name)).filter(Boolean);
      else if (md) writes = [...code.slice(md.start, md.end).matchAll(/dispatch\(\s*(\w+)/g)].map((m) => m[1]);
      mod.connects[target] = { reads: [...new Set(reads)], writes: [...new Set(writes)], line: lineOf(n) };
    },
  });
}

/** What a custom hook reads, so components calling it inherit the reads (useAuth → AuthContext). */
function hookFacts(fnPath) {
  const reads = [];
  const calls = new Set();
  fnPath.traverse({
    CallExpression(p) {
      const hook = hookName(p.node.callee);
      if (!hook) return;
      const arg = p.node.arguments[0];
      if (hook === 'useContext' || hook === 'use') {
        const ctx = memberText(arg);
        if (ctx) reads.push({ kind: 'context', store: ctx });
      } else if (SELECTOR_HOOKS.test(hook) && arg && /Function/.test(arg.type)) {
        statePaths(arg, p.get('arguments.0')).forEach((sp) => reads.push({ kind: 'redux', path: sp }));
      } else if (/^use\w*Store$/.test(hook) && hook !== 'useStore') {
        const paths = arg && /Function/.test(arg.type) ? statePaths(arg, p.get('arguments.0')) : ['(whole store)'];
        paths.forEach((sp) => reads.push({ kind: 'zustand', store: hook, path: sp }));
      } else calls.add(hook);
    },
  });
  return { reads, calls: [...calls] };
}

function findDeclaration(programPath, name) {
  const binding = programPath.scope.getBinding(name);
  if (!binding) return null;
  if (binding.path.isFunctionDeclaration()) return binding.path.node;
  if (binding.path.isVariableDeclarator()) return binding.path.node.init;
  return null;
}

function resolveObject(node, programPath) {
  if (!node) return null;
  if (node.type === 'ObjectExpression') return node;
  if (node.type === 'Identifier') {
    const decl = findDeclaration(programPath, node.name);
    return decl?.type === 'ObjectExpression' ? decl : decl?.type === 'TSAsExpression' && decl.expression.type === 'ObjectExpression' ? decl.expression : null;
  }
  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') return resolveObject(node.expression, programPath);
  return null;
}

