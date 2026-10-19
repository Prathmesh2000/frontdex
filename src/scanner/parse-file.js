import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { extractClassComponent, extractFunctionComponent, isReactClass, memberText, readJSDoc } from './component.js';
import { analyzeComponent, analyzeModule } from './insights.js';
import { extractAngularComponent, isAngularComponent } from './angular.js';
import { jsxA11y } from './analyzers/a11y.js';
import { styledLiterals, styledTarget, themeTokens } from './analyzers/cssinjs.js';
import { jsxText } from './analyzers/i18n.js';
import { definedTags, extractCustomElement, isElementClass } from './webcomponents.js';

const traverse = _traverse.default ?? _traverse;
// Qwik's component$ wraps a plain function component the same way memo does; it is recorded as kind `function`.
const WRAPPER = /(^|\.)(memo|forwardRef)$|^component\$$/;
// TanStack Router route declarations: createFileRoute('/posts/$id')({ component }), createRootRoute({ component }), …
const TANSTACK_ROUTE = /^create(Lazy)?(File|Root)Route(WithContext)?$|^createRoute$/;
// React Router v7 framework-mode route config helpers (app/routes.ts).
const RR_CONFIG = new Set(['route', 'index', 'layout', 'prefix']);
const LAZY = /^(React\.)?lazy$|^dynamic$|^loadable$/;
const NEXT_SPECIAL = { page: 'Page', layout: 'Layout', template: 'Template', loading: 'Loading', error: 'Error', 'not-found': 'NotFound', default: 'Default', index: 'Page' };

/**
 * Parses one JS/TS module. `syntaxFile` picks the Babel plugins (by extension) when `file` is not itself a script, as for
 * the <script> block of a .vue file, and `startLine` keeps line numbers relative to the real file.
 */
export function parseFile(file, code = fs.readFileSync(file, 'utf8'), { syntaxFile = file, startLine = 1 } = {}) {
  const mod = {
    file,
    code,
    imports: new Map(),
    exports: new Map(),
    reexports: [],
    exportAll: [],
    aliases: new Map(),
    components: [],
    routes: [],
    consts: {},
    types: new Map(),
    statics: new Map(),
    typeImports: [],
  };
  const ext = path.extname(syntaxFile);
  const plugins = ['decorators-legacy', ...(ext === '.ts' ? ['typescript'] : ext === '.tsx' ? ['typescript', 'jsx'] : ['jsx'])];
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true, startLine });
  } catch (err) {
    mod.error = err.message;
    return mod;
  }
  try {
    traverse(ast, {
      Program(p) {
        // 'use client' marks a React Server Components client boundary; 'use server' makes every export a server action.
        const directive = p.node.directives?.map((d) => d.value.value).find((v) => v === 'use client' || v === 'use server');
        if (directive) mod.directive = directive;
        scanDeclarations(p, mod);
        analyzeModule(p, mod);
        scanComponents(p, mod);
        scanRouteModule(p, mod);
        const theme = themeTokens(p.node);
        if (Object.keys(theme).length) mod.themeTokens = theme;
        p.stop();
      },
    });
    traverse(ast, {
      JSXOpeningElement(p) {
        jsxRoute(p, mod);
      },
      ObjectExpression(p) {
        objectRoute(p, mod);
      },
    });
  } catch (err) {
    // Scope errors (e.g. a duplicate declaration while the file is mid-edit) must not abort the whole scan.
    mod.error = err.message;
    mod.components = [];
    mod.routes = [];
  }
  delete mod.code;
  delete mod.types;
  delete mod.statics;
  delete mod.styleModules;
  return mod;
}

/**
 * Route declarations that live in a module rather than in JSX:
 *   mod.fileRoute   TanStack Router: { path, component, root } from `export const Route = createFileRoute(...)({ component })`
 *   mod.routeConfig React Router v7 framework mode: the tree exported by app/routes.ts (route/index/layout/prefix calls)
 */
function scanRouteModule(programPath, mod) {
  for (const stmt of programPath.node.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : null;
    if (decl?.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        const route = d.id.name === 'Route' && tanstackRoute(d.init);
        if (route) mod.fileRoute = route;
      }
    }
    if (stmt.type === 'ExportDefaultDeclaration' && [...mod.imports.values()].some((i) => i.source === '@react-router/dev/routes')) {
      let node = stmt.declaration;
      while (node.type === 'TSSatisfiesExpression' || node.type === 'TSAsExpression') node = node.expression;
      if (node.type === 'ArrayExpression') mod.routeConfig = routeConfigList(node, mod);
    }
  }
}

function tanstackRoute(node) {
  let path;
  let component;
  let root = false;
  let seen = false;
  // Walk the curried call chain outward-in: createFileRoute('/x')({ component: X }).
  for (let n = node; n?.type === 'CallExpression'; n = n.callee) {
    const name = memberText(n.callee);
    if (name && TANSTACK_ROUTE.test(name)) {
      seen = true;
      root = /Root/.test(name);
      if (n.arguments[0]?.type === 'StringLiteral') path = n.arguments[0].value;
    }
    const opts = n.arguments.find((a) => a.type === 'ObjectExpression');
    const comp = opts?.properties.find((p) => p.type === 'ObjectProperty' && keyName(p.key) === 'component');
    if (comp?.value.type === 'Identifier') component ??= comp.value.name;
    if (n.callee.type !== 'CallExpression' && !(name && TANSTACK_ROUTE.test(name))) return null;
  }
  return seen ? { ...(path && { path }), ...(component && { component }), ...(root && { root }) } : null;
}

/** Statically evaluates route()/index()/layout()/prefix() calls; `...(await flatRoutes())` becomes { flat: true }. */
function routeConfigList(array, mod) {
  const out = [];
  for (const el of array.elements) {
    if (!el) continue;
    if (el.type === 'SpreadElement') {
      let arg = el.argument;
      if (arg.type === 'AwaitExpression') arg = arg.argument;
      if (arg.type === 'CallExpression' && memberText(arg.callee) === 'flatRoutes') out.push({ flat: true });
      else if (arg.type === 'CallExpression' && importedName(mod, arg.callee) === 'prefix') {
        const [p, children] = arg.arguments;
        if (p?.type === 'StringLiteral' && children?.type === 'ArrayExpression') out.push({ prefix: p.value, children: routeConfigList(children, mod) });
      }
      continue;
    }
    if (el.type !== 'CallExpression') continue;
    const kind = importedName(mod, el.callee);
    if (!RR_CONFIG.has(kind)) continue;
    const args = el.arguments;
    const str = (n) => (n?.type === 'StringLiteral' ? n.value : undefined);
    const kids = (n) => (n?.type === 'ArrayExpression' ? routeConfigList(n, mod) : undefined);
    if (kind === 'route') out.push({ path: str(args[0]), file: str(args[1]), children: kids(args[2]) ?? kids(args[3]) });
    else if (kind === 'index') out.push({ index: true, file: str(args[0]) });
    else if (kind === 'layout') out.push({ layout: true, file: str(args[0]), children: kids(args[1]) ?? kids(args[2]) });
    else if (kind === 'prefix') out.push({ prefix: str(args[0]), children: kids(args[1]) });
  }
  return out;
}

/** The exported name a callee refers to when imported from @react-router/dev/routes (handles `route as r`). */
function importedName(mod, callee) {
  if (callee.type !== 'Identifier') return null;
  const imp = mod.imports.get(callee.name);
  return imp?.source === '@react-router/dev/routes' ? imp.imported : null;
}

// Route paths often live in constant objects (ROUTES.LOGIN). Only path-like strings are kept, so translation tables
// and other big string maps do not bloat every parse record.
const PATH_LIKE = /^[\w\-./:*$~]{0,200}$/;

/** A const initialiser as a plain value: a path-like string, or an object (nested) of them. undefined otherwise. */
function pathLiteral(node) {
  while (node?.type === 'TSAsExpression' || node?.type === 'TSSatisfiesExpression') node = node.expression;
  if (node?.type === 'CallExpression' && memberText(node.callee) === 'Object.freeze') node = node.arguments[0];
  const text = node?.type === 'StringLiteral' ? node.value : node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : undefined;
  if (text !== undefined) return PATH_LIKE.test(text) ? text : undefined;
  if (node?.type !== 'ObjectExpression') return undefined;
  const out = {};
  for (const p of node.properties) {
    const key = p.type === 'ObjectProperty' ? keyName(p.key) : undefined;
    const value = key !== undefined ? pathLiteral(p.value) : undefined;
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function keyName(node) {
  return node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : undefined;
}

function scanDeclarations(programPath, mod) {
  for (const stmt of programPath.node.body) {
    if (stmt.type === 'ImportDeclaration') {
      if (stmt.importKind === 'type') {
        mod.typeImports.push(stmt.source.value);
        continue;
      }
      for (const s of stmt.specifiers) {
        const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.type === 'ImportNamespaceSpecifier' ? '*' : keyName(s.imported);
        mod.imports.set(s.local.name, { source: stmt.source.value, imported });
      }
      continue;
    }
    const decl = stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration' ? stmt.declaration : stmt;
    if (decl?.type === 'TSInterfaceDeclaration' || decl?.type === 'TSTypeAliasDeclaration') mod.types.set(decl.id.name, decl);
    if (decl?.type === 'VariableDeclaration' && decl.kind === 'const') {
      for (const d of decl.declarations) {
        const value = d.id.type === 'Identifier' ? pathLiteral(d.init) : undefined;
        if (value !== undefined) mod.consts[d.id.name] = value;
      }
    }
    if (stmt.type === 'ExportDefaultDeclaration') {
      const value = pathLiteral(stmt.declaration);
      if (value !== undefined) mod.consts.default = value;
    }

    if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression') {
      const m = memberText(stmt.expression.left)?.match(/^(\w+)\.(propTypes|defaultProps)$/);
      if (m) mod.statics.set(m[1], { ...mod.statics.get(m[1]), [m[2]]: stmt.expression.right });
      const sub = memberText(stmt.expression.left)?.match(/^([A-Z]\w*)\.([A-Z]\w*)$/);
      if (sub && stmt.expression.right.type === 'Identifier') mod.aliases.set(`${sub[1]}.${sub[2]}`, stmt.expression.right.name);
    }

    if (stmt.type === 'ExportAllDeclaration') mod.exportAll.push(stmt.source.value);
    if (stmt.type !== 'ExportNamedDeclaration' || stmt.exportKind === 'type') continue;
    for (const s of stmt.specifiers) {
      if (s.type !== 'ExportSpecifier') continue;
      const local = keyName(s.local);
      const exported = keyName(s.exported);
      if (stmt.source) mod.reexports.push({ source: stmt.source.value, imported: local, exported });
      else mod.exports.set(exported, local);
    }
    const d = stmt.declaration;
    if (d?.type === 'FunctionDeclaration' || d?.type === 'ClassDeclaration') mod.exports.set(d.id.name, d.id.name);
    if (d?.type === 'VariableDeclaration') d.declarations.forEach((v) => v.id.type === 'Identifier' && mod.exports.set(v.id.name, v.id.name));
  }
}

function pascal(s) {
  return s
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('');
}

export function deriveName(file) {
  const base = path.basename(file, path.extname(file));
  const dir = path.basename(path.dirname(file));
  if (NEXT_SPECIAL[base]) {
    const parent = path.basename(path.dirname(path.dirname(file)));
    const clean = dir.startsWith('[') ? pascal(parent) + pascal(dir) : pascal(dir);
    const prefix = ['App', 'Pages', 'Src', 'Routes', ''].includes(clean) ? (base === 'layout' ? 'Root' : 'Home') : clean;
    return prefix + NEXT_SPECIAL[base];
  }
  if (base.startsWith('[')) return pascal(dir) + pascal(base) + 'Page';
  return pascal(base) || 'Anonymous';
}

function hasJSX(p) {
  if (p.node.body?.type?.startsWith('JSX')) return true;
  let found = false;
  p.traverse({
    'JSXElement|JSXFragment'(q) {
      found = true;
      q.stop();
    },
  });
  return found;
}

function unwrap(p) {
  let kind;
  let typeHint;
  while (p.isCallExpression() && WRAPPER.test(memberText(p.node.callee) ?? '')) {
    const wrapper = memberText(p.node.callee).split('.').pop();
    kind ??= wrapper === 'component$' ? 'function' : wrapper;
    const params = p.node.typeParameters?.params ?? p.node.typeArguments?.params;
    typeHint ??= wrapper === 'forwardRef' ? params?.[1] : params?.[0];
    p = p.get('arguments.0');
  }
  if (p.isCallExpression() && !kind && p.node.arguments[0]?.type === 'Identifier') {
    // HOC exports such as withRouter(Foo) or connect(...)(Foo) keep pointing at Foo.
    return { ident: p.node.arguments[0].name };
  }
  return { path: p, kind, typeHint };
}

/** `const Tabs = Object.assign(TabsRoot, { List: TabsList, Panel })` → Tabs aliases TabsRoot, Tabs.List aliases TabsList. */
function compoundAssign(name, node, mod) {
  if (node.type !== 'CallExpression' || memberText(node.callee) !== 'Object.assign') return false;
  const [base, members] = node.arguments;
  if (base?.type !== 'Identifier' || members?.type !== 'ObjectExpression') return false;
  mod.aliases.set(name, base.name);
  for (const p of members.properties) {
    if (p.type === 'ObjectProperty' && p.value.type === 'Identifier') mod.aliases.set(`${name}.${keyName(p.key)}`, p.value.name);
  }
  return true;
}

function lazyImport(p) {
  if (!p.isCallExpression() || !LAZY.test(memberText(p.node.callee) ?? '')) return null;
  let found = null;
  p.traverse({
    CallExpression(q) {
      if (q.node.callee.type === 'Import' && q.node.arguments[0]?.type === 'StringLiteral') {
        found = { source: q.node.arguments[0].value, imported: 'default', lazy: true };
        q.stop();
      }
    },
  });
  const named = p.toString().match(/\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>[^]*?\b\1\.(\w+)/);
  if (found && named) found.imported = named[2];
  return found;
}

function scanComponents(programPath, mod) {
  const add = (fnPath, name, kind, docNode, typeHint, isClass) => {
    const line = fnPath.node.loc?.start.line;
    const ctx = { mod, name, kind, line, typeHint };
    const record = isClass ? extractClassComponent(fnPath, ctx) : extractFunctionComponent(fnPath, ctx);
    analyzeComponent(fnPath, record, mod, { isClass });
    const a11y = jsxA11y(fnPath);
    if (a11y.length) record.issues = [...(record.issues ?? []), ...a11y];
    // Kept on the parse record only; graph.js turns it into an issue when the project uses an i18n library.
    const text = jsxText(fnPath);
    if (text) record.hardcodedText = text;
    const doc = readJSDoc(docNode);
    if (doc.description) record.description = doc.description;
    if (doc.deprecated) record.status = 'deprecated';
    mod.components.push(record);
  };

  let tags = null;
  for (const stmt of programPath.get('body')) {
    let target = stmt;
    let isDefault = false;
    if (stmt.isExportNamedDeclaration()) {
      if (!stmt.node.declaration) continue;
      target = stmt.get('declaration');
    } else if (stmt.isExportDefaultDeclaration()) {
      target = stmt.get('declaration');
      isDefault = true;
    }
    const docNode = stmt.node.leadingComments?.length ? stmt.node : target.node;

    if (target.isFunctionDeclaration() || (isDefault && (target.isArrowFunctionExpression() || target.isFunctionExpression()))) {
      const name = target.node.id?.name ?? deriveName(mod.file);
      if (isDefault) mod.exports.set('default', name);
      if (/^[A-Z]/.test(name) && hasJSX(target)) add(target, name, 'function', docNode);
    } else if ((target.isClassDeclaration() || target.isClassExpression()) && isReactClass(target.node.superClass)) {
      const name = target.node.id?.name ?? deriveName(mod.file);
      if (isDefault) mod.exports.set('default', name);
      add(target, name, 'class', docNode, undefined, true);
    } else if ((target.isClassDeclaration() || target.isClassExpression()) && isAngularComponent(target.node)) {
      const name = target.node.id?.name ?? deriveName(mod.file);
      if (isDefault) mod.exports.set('default', name);
      mod.components.push(extractAngularComponent(target, { name, line: target.node.loc?.start.line, file: mod.file, code: mod.code }));
    } else if ((target.isClassDeclaration() || target.isClassExpression()) && isElementClass(target.node.superClass)) {
      const name = target.node.id?.name ?? deriveName(mod.file);
      if (isDefault) mod.exports.set('default', name);
      tags ??= definedTags(programPath);
      const record = extractCustomElement(target, { name, line: target.node.loc?.start.line, tag: tags.get(name), code: mod.code });
      const doc = readJSDoc(docNode);
      if (doc.description) record.description = doc.description;
      mod.components.push(record);
    } else if (target.isVariableDeclaration()) {
      for (const d of target.get('declarations')) {
        const name = d.node.id.name;
        const init = d.get('init');
        if (!name || !/^[A-Z]/.test(name) || !init.node) continue;
        if (compoundAssign(name, init.node, mod)) continue;
        const styled = styledTarget(init.node);
        if (styled) {
          const line = d.node.loc?.start.line;
          // cssLiterals stays on the parse record; the token-drift check reads it, the catalogue does not store it.
          mod.components.push({ name, kind: 'styled', line, ...(styled.element && { element: styled.element }), props: {}, state: {}, context: [], refs: [], hooks: [], lifecycle: [], jsx: styled.base ? [{ name: styled.base, line, props: [] }] : [], cssLiterals: styledLiterals(init.node) });
          continue;
        }
        const lazy = lazyImport(init);
        if (lazy) {
          mod.imports.set(name, lazy);
          continue;
        }
        const idType = d.node.id.typeAnnotation?.typeAnnotation;
        const fcHint = idType?.type === 'TSTypeReference' ? (idType.typeParameters ?? idType.typeArguments)?.params?.[0] : undefined;
        const u = unwrap(init);
        if (u.ident) mod.aliases.set(name, u.ident);
        else if (u.path.isIdentifier()) mod.aliases.set(name, u.path.node.name);
        else if ((u.path.isArrowFunctionExpression() || u.path.isFunctionExpression()) && hasJSX(u.path)) {
          add(u.path, name, u.kind ?? 'function', docNode, u.typeHint ?? fcHint);
        } else if (u.path.isClassExpression() && isReactClass(u.path.node.superClass)) {
          add(u.path, name, 'class', docNode, undefined, true);
        }
      }
    } else if (isDefault) {
      if (target.isIdentifier()) {
        mod.exports.set('default', target.node.name);
        continue;
      }
      const u = unwrap(target);
      if (u.ident) mod.exports.set('default', u.ident);
      else if (u.path.isIdentifier()) mod.exports.set('default', u.path.node.name);
      else if ((u.path.isArrowFunctionExpression() || u.path.isFunctionExpression()) && hasJSX(u.path)) {
        const name = u.path.node.id?.name ?? deriveName(mod.file);
        mod.exports.set('default', name);
        add(u.path, name, u.kind ?? 'function', docNode, u.typeHint);
      }
    }
  }
}

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
 * A route path expression as parts, evaluated in graph.js once every module is parsed, because the constants it
 * names (ROUTES.HOME) usually live in another file. Parts are strings, { ref: 'ROUTES.HOME' } and
 * { slice: parts, args } for `.slice(1)`. Anything else becomes a ref that will not resolve and shows as {text}.
 */
function pathParts(node) {
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

function evalParts(parts, lookup) {
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

function jsxAttrs(opening) {
  const attrs = {};
  for (const a of opening.attributes) {
    if (a.type !== 'JSXAttribute') continue;
    const v = a.value;
    attrs[a.name.name] = !v ? true : v.type === 'StringLiteral' ? v.value : v.type === 'JSXExpressionContainer' ? v.expression : undefined;
  }
  return attrs;
}

function jsxName(n) {
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${jsxName(n.object)}.${n.property.name}`;
  return undefined;
}

const TRANSPARENT = /^(React\.)?(Suspense|Fragment|StrictMode)$/;

// What a route renders while the real page loads or when it redirects; never the page itself when there is a choice.
const NOT_A_PAGE = /^(Navigate|Redirect)$|Loader|Loading|Spinner|Skeleton|Fallback|Placeholder/;

/** Of several possible elements (cond ? <A /> : <B />), the page is the first that is not a loader or redirect. */
function choose(options) {
  const found = options.filter(Boolean);
  if (!found.length) return null;
  const page = found.find((o) => !NOT_A_PAGE.test(o.component)) ?? found[0];
  const alternates = found.filter((o) => o !== page).flatMap((o) => [o.component, ...o.alternates]);
  return { ...page, alternates: [...page.alternates, ...alternates] };
}

/**
 * The page a route element shows: { component, wrappers, alternates }. Guards and providers wrapping a single child
 * (<RequireAuth><Dashboard /></RequireAuth>) become wrappers of the page they wrap; conditional elements pick the
 * branch that is not a loader or redirect and keep the rest as alternates.
 */
function pickComponent(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'JSXElement') {
    const name = jsxName(value.openingElement.name);
    const transparent = !name || TRANSPARENT.test(name) || /^[a-z]/.test(name);
    const kids = value.children.filter((c) => c.type === 'JSXElement' || (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression'));
    // <Layout><Outlet /></Layout> is a layout for child routes, not a wrapper around a page called Outlet.
    const only = kids.length === 1 && !(kids[0].type === 'JSXElement' && jsxName(kids[0].openingElement.name) === 'Outlet') ? kids[0] : null;
    const inner = only && pickComponent(only.type === 'JSXExpressionContainer' ? only.expression : only);
    if (inner) return transparent ? inner : { ...inner, wrappers: [name, ...inner.wrappers] };
    return transparent ? null : { component: name, wrappers: [], alternates: [] };
  }
  if (value.type === 'ConditionalExpression') return choose([pickComponent(value.consequent), pickComponent(value.alternate)]);
  if (value.type === 'LogicalExpression') return value.operator === '&&' ? pickComponent(value.right) : choose([pickComponent(value.left), pickComponent(value.right)]);
  // Helpers such as withSuspense(<Page />) or guard(<Page />, opts)
  if (value.type === 'CallExpression') {
    for (const arg of value.arguments) {
      const found = pickComponent(arg);
      if (found) return found;
    }
    return null;
  }
  if (value.type === 'Identifier') return { component: value.name, wrappers: [], alternates: [] };
  return null;
}

const componentOf = (value) => pickComponent(value)?.component;

function jsxRoute(p, mod) {
  if (p.node.name.type !== 'JSXIdentifier' || p.node.name.name !== 'Route') return;
  const attrs = jsxAttrs(p.node);
  if (attrs.path == null && !attrs.index) return;
  // A <Route> with nested <Route>s is a layout for them, not a page of its own; so is one whose children are generated
  // ({routes.map((r) => <Route … />)}), since a leaf route has no children.
  if (p.parent.children?.some((c) => (c.type === 'JSXElement' && jsxName(c.openingElement.name) === 'Route') || (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression'))) return;
  const pick = pickComponent(attrs.element) ?? pickComponent(attrs.component) ?? pickComponent(attrs.Component);
  if (!pick) return;
  const segments = [attrs.index ? null : pathParts(attrs.path)];
  const layouts = [];
  const extras = [componentOf(attrs.errorElement) ?? componentOf(attrs.ErrorBoundary)].filter(Boolean);
  for (let a = p.parentPath.parentPath; a; a = a.parentPath) {
    if (!a.isJSXElement()) continue;
    const name = a.node.openingElement.name;
    if (name.type !== 'JSXIdentifier' || name.name !== 'Route') continue;
    const outer = jsxAttrs(a.node.openingElement);
    segments.unshift(outer.path == null ? null : pathParts(outer.path));
    const layout = componentOf(outer.element) ?? componentOf(outer.Component);
    if (layout) layouts.unshift(layout);
    const boundary = componentOf(outer.errorElement) ?? componentOf(outer.ErrorBoundary);
    if (boundary) extras.push(boundary);
  }
  mod.routes.push({ segments, ...pick, layouts, extras, line: p.node.loc?.start.line });
}

function objectProps(node) {
  const out = {};
  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    const key = keyName(prop.key);
    const v = prop.value;
    out[key] = v.type === 'StringLiteral' ? v.value : v.type === 'BooleanLiteral' ? v.value : v;
  }
  return out;
}

/**
 * Vue Router's `component` key: an identifier, or a lazy `() => import('./About.vue')`, which is recorded as a synthetic
 * default import so it resolves like any other.
 */
function lowerComponent(value, mod) {
  if (!value || typeof value !== 'object') return undefined;
  if (value.type === 'Identifier') return value.name;
  const body = (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') && value.body;
  let call = body?.type === 'CallExpression' ? body : null;
  // Angular loadComponent: () => import('./x').then((m) => m.XComponent)
  let imported = 'default';
  if (call?.callee.type === 'MemberExpression' && call.callee.property.name === 'then' && call.callee.object.type === 'CallExpression') {
    const pick = call.arguments[0];
    if (pick?.body?.type === 'MemberExpression' && pick.body.property.type === 'Identifier') imported = pick.body.property.name;
    call = call.callee.object;
  }
  if (call?.callee.type === 'Import' && call.arguments[0]?.type === 'StringLiteral') {
    const local = `__lazyRoute${value.start}`;
    mod.imports.set(local, { source: call.arguments[0].value, imported, lazy: true });
    return local;
  }
  return undefined;
}

function objectRoute(p, mod) {
  const own = objectProps(p.node);
  if (own.path == null && own.index !== true) return;
  if ('children' in own) return;
  // Vue/Angular lazy loaders first (they register a synthetic import), then JSX elements, which may be conditional or wrapped.
  const lazy = lowerComponent(own.component, mod) ?? lowerComponent(own.loadComponent, mod);
  const pick = pickComponent(own.element) ?? pickComponent(own.Component) ?? (lazy ? { component: lazy, wrappers: [], alternates: [] } : pickComponent(own.component));
  if (!pick) return;
  const segments = [own.index === true ? null : pathParts(own.path)];
  const layouts = [];
  const extras = [componentOf(own.errorElement) ?? componentOf(own.ErrorBoundary)].filter(Boolean);
  for (let a = p.parentPath; a; a = a.parentPath) {
    if (!a.isObjectExpression()) continue;
    const outer = objectProps(a.node);
    if (!('children' in outer)) continue;
    segments.unshift(outer.path == null ? null : pathParts(outer.path));
    const layout = componentOf(outer.element) ?? componentOf(outer.Component) ?? lowerComponent(outer.component, mod) ?? lowerComponent(outer.loadComponent, mod);
    if (layout) layouts.unshift(layout);
    const boundary = componentOf(outer.errorElement) ?? componentOf(outer.ErrorBoundary);
    if (boundary) extras.push(boundary);
  }
  mod.routes.push({ segments, ...pick, layouts, extras, line: p.node.loc?.start.line });
}
