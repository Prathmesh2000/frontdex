import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { extractClassComponent, extractFunctionComponent, isReactClass, memberText, readJSDoc } from './component.js';
import { analyzeComponent, analyzeModule } from './insights.js';
import { extractAngularComponent, isAngularComponent } from './angular.js';
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

function joinRoute(segments) {
  let out = '';
  for (const seg of segments) {
    if (seg == null) continue;
    out = seg.startsWith('/') ? seg : `${out.replace(/\/$/, '')}/${seg}`;
  }
  out = out.replace(/\/+/g, '/');
  return out === '' ? '/' : out.length > 1 ? out.replace(/\/$/, '') : out;
}

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

function componentOf(value) {
  if (!value || value === true) return undefined;
  if (value.type === 'JSXElement') {
    const name = jsxName(value.openingElement.name);
    if (!TRANSPARENT.test(name ?? '')) return name;
    const child = value.children.find((c) => c.type === 'JSXElement');
    return child ? componentOf(child) : undefined;
  }
  // Helpers such as withSuspense(<Page />) or guard(<Page />, opts)
  if (value.type === 'CallExpression') {
    for (const arg of value.arguments) {
      const found = componentOf(arg);
      if (found) return found;
    }
    return undefined;
  }
  if (value.type === 'Identifier') return value.name;
  return undefined;
}

function jsxRoute(p, mod) {
  if (p.node.name.type !== 'JSXIdentifier' || p.node.name.name !== 'Route') return;
  const attrs = jsxAttrs(p.node);
  if (typeof attrs.path !== 'string' && !attrs.index) return;
  // A <Route> with nested <Route>s is a layout for them, not a page of its own.
  if (p.parent.children?.some((c) => c.type === 'JSXElement' && jsxName(c.openingElement.name) === 'Route')) return;
  const component = componentOf(attrs.element) ?? componentOf(attrs.component) ?? componentOf(attrs.Component);
  const paths = [];
  const layouts = [];
  const extras = [componentOf(attrs.errorElement) ?? componentOf(attrs.ErrorBoundary)].filter(Boolean);
  for (let a = p.parentPath.parentPath; a; a = a.parentPath) {
    if (!a.isJSXElement()) continue;
    const name = a.node.openingElement.name;
    if (name.type !== 'JSXIdentifier' || name.name !== 'Route') continue;
    const outer = jsxAttrs(a.node.openingElement);
    paths.unshift(typeof outer.path === 'string' ? outer.path : null);
    const layout = componentOf(outer.element) ?? componentOf(outer.Component);
    if (layout) layouts.unshift(layout);
    const boundary = componentOf(outer.errorElement) ?? componentOf(outer.ErrorBoundary);
    if (boundary) extras.push(boundary);
  }
  if (component) mod.routes.push({ path: joinRoute([...paths, attrs.index ? null : attrs.path]), component, layouts, extras, line: p.node.loc?.start.line });
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
  if (typeof own.path !== 'string' && own.index !== true) return;
  if ('children' in own) return;
  const component = componentOf(own.element) ?? componentOf(own.Component) ?? lowerComponent(own.component, mod) ?? lowerComponent(own.loadComponent, mod);
  if (!component) return;
  const paths = [];
  const layouts = [];
  const extras = [componentOf(own.errorElement) ?? componentOf(own.ErrorBoundary)].filter(Boolean);
  for (let a = p.parentPath; a; a = a.parentPath) {
    if (!a.isObjectExpression()) continue;
    const outer = objectProps(a.node);
    if (!('children' in outer)) continue;
    paths.unshift(typeof outer.path === 'string' ? outer.path : null);
    const layout = componentOf(outer.element) ?? componentOf(outer.Component) ?? lowerComponent(outer.component, mod) ?? lowerComponent(outer.loadComponent, mod);
    if (layout) layouts.unshift(layout);
    const boundary = componentOf(outer.errorElement) ?? componentOf(outer.ErrorBoundary);
    if (boundary) extras.push(boundary);
  }
  mod.routes.push({ path: joinRoute([...paths, own.index ? null : own.path]), component, layouts, extras, line: p.node.loc?.start.line });
}
