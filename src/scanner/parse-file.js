import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { extractClassComponent, extractFunctionComponent, isReactClass, memberText, readJSDoc } from './component.js';

const traverse = _traverse.default ?? _traverse;
const WRAPPER = /(^|\.)(memo|forwardRef)$/;
const LAZY = /^(React\.)?lazy$|^dynamic$|^loadable$/;
const NEXT_SPECIAL = { page: 'Page', layout: 'Layout', template: 'Template', loading: 'Loading', error: 'Error', 'not-found': 'NotFound', default: 'Default', index: 'Page' };

export function parseFile(file) {
  const code = fs.readFileSync(file, 'utf8');
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
  };
  const ext = path.extname(file);
  const plugins = ['decorators-legacy', ...(ext === '.ts' ? ['typescript'] : ext === '.tsx' ? ['typescript', 'jsx'] : ['jsx'])];
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true });
  } catch (err) {
    mod.error = err.message;
    return mod;
  }
  traverse(ast, {
    Program(p) {
      scanDeclarations(p, mod);
      scanComponents(p, mod);
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
  delete mod.code;
  delete mod.types;
  delete mod.statics;
  return mod;
}

function keyName(node) {
  return node?.type === 'Identifier' ? node.name : node?.type === 'StringLiteral' ? node.value : undefined;
}

function scanDeclarations(programPath, mod) {
  for (const stmt of programPath.node.body) {
    if (stmt.type === 'ImportDeclaration') {
      if (stmt.importKind === 'type') continue;
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
    const prefix = ['App', 'Pages', 'Src', ''].includes(clean) ? (base === 'layout' ? 'Root' : 'Home') : clean;
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
    kind ??= wrapper;
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
    const doc = readJSDoc(docNode);
    if (doc.description) record.description = doc.description;
    if (doc.deprecated) record.status = 'deprecated';
    mod.components.push(record);
  };

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
    } else if (target.isVariableDeclaration()) {
      for (const d of target.get('declarations')) {
        const name = d.node.id.name;
        const init = d.get('init');
        if (!name || !/^[A-Z]/.test(name) || !init.node) continue;
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

function componentOf(value) {
  if (!value || value === true) return undefined;
  if (value.type === 'JSXElement') return jsxName(value.openingElement.name);
  if (value.type === 'Identifier') return value.name;
  return undefined;
}

function jsxRoute(p, mod) {
  if (p.node.name.type !== 'JSXIdentifier' || p.node.name.name !== 'Route') return;
  const attrs = jsxAttrs(p.node);
  if (typeof attrs.path !== 'string' && !attrs.index) return;
  const component = componentOf(attrs.element) ?? componentOf(attrs.component) ?? componentOf(attrs.Component);
  const paths = [];
  const layouts = [];
  for (let a = p.parentPath.parentPath; a; a = a.parentPath) {
    if (!a.isJSXElement()) continue;
    const name = a.node.openingElement.name;
    if (name.type !== 'JSXIdentifier' || name.name !== 'Route') continue;
    const outer = jsxAttrs(a.node.openingElement);
    paths.unshift(typeof outer.path === 'string' ? outer.path : null);
    const layout = componentOf(outer.element) ?? componentOf(outer.Component);
    if (layout) layouts.unshift(layout);
  }
  if (component) mod.routes.push({ path: joinRoute([...paths, attrs.index ? null : attrs.path]), component, layouts, line: p.node.loc?.start.line });
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

function objectRoute(p, mod) {
  const own = objectProps(p.node);
  if (typeof own.path !== 'string' && own.index !== true) return;
  const component = componentOf(own.element) ?? componentOf(own.Component);
  if (!component) return;
  const paths = [];
  const layouts = [];
  for (let a = p.parentPath; a; a = a.parentPath) {
    if (!a.isObjectExpression()) continue;
    const outer = objectProps(a.node);
    if (!('children' in outer)) continue;
    paths.unshift(typeof outer.path === 'string' ? outer.path : null);
    const layout = componentOf(outer.element) ?? componentOf(outer.Component);
    if (layout) layouts.unshift(layout);
  }
  mod.routes.push({ path: joinRoute([...paths, own.index ? null : own.path]), component, layouts, line: p.node.loc?.start.line });
}
