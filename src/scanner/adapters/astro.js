import path from 'node:path';
import { parse as babelParse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { memberText } from '../component.js';
import { deriveName, parseFile } from '../parse-file.js';
import { apiCall, loadFromProject, mergeScript, snippet } from './common.js';

/*
 * Astro components (.astro), parsed with the project's own @astrojs/compiler (its synchronous entry point). The
 * frontmatter is ordinary TS: imports, `Astro.props` (typed by `interface Props`), and data fetching at build/request
 * time. The template yields child components, including framework islands (`client:*` directives are kept as props).
 */

const traverse = _traverse.default ?? _traverse;

export function parseAstro(file, code) {
  const compiler = loadFromProject(file, '@astrojs/compiler/sync');
  const mod = { file, imports: new Map(), exports: new Map(), reexports: [], exportAll: [], aliases: new Map(), components: [], routes: [], typeImports: [] };
  if (!compiler) return { ...mod, error: '@astrojs/compiler not found: install astro in the project to scan .astro files' };
  let ast;
  try {
    ({ ast } = compiler.parse(code, { position: true }));
  } catch (err) {
    return { ...mod, error: err.message };
  }
  const name = path.basename(path.dirname(file)) === 'layouts' ? `${deriveName(file)}Layout`.replace(/LayoutLayout$/, 'Layout') : deriveName(file);
  const record = { name, kind: 'function', line: 1, props: {}, state: {}, context: [], refs: [], hooks: new Map(), lifecycle: [], jsx: [], apiCalls: [] };

  const front = ast.children.find((n) => n.type === 'frontmatter');
  if (front?.value) {
    const startLine = (front.position?.start?.line ?? 1) + 1;
    mergeScript(mod, parseFile(file, front.value, { syntaxFile: `${file}.ts`, startLine }));
    scanFrontmatter(front.value, startLine, record);
  }
  const classes = new Set();
  const walk = (node) => {
    if (node.type === 'component' && /^[A-Z]/.test(node.name)) {
      record.jsx.push({
        name: node.name,
        line: node.position?.start?.line ?? 1,
        props: (node.attributes ?? []).map((a) => ({ name: a.name, value: a.kind === 'quoted' ? JSON.stringify(a.value) : a.kind === 'empty' ? 'true' : a.kind === 'spread' ? 'spread' : a.value })),
      });
    }
    if (node.type === 'element') {
      const cls = (node.attributes ?? []).find((a) => a.name === 'class' && a.kind === 'quoted');
      cls?.value.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(ast);
  if (classes.size) record.styles = { classes: [...classes] };
  record.hooks = [];
  mod.exports.set('default', record.name);
  mod.components = [record];
  return mod;
}

/** Props from `const { a, b = 1 } = Astro.props` typed by `interface Props`, and fetches made by the frontmatter. */
function scanFrontmatter(code, startLine, record) {
  let ast;
  try {
    ast = babelParse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, startLine });
  } catch {
    return;
  }
  const text = (node, max) => snippet(code, node, max);
  const types = new Map();
  for (const stmt of ast.program.body) {
    const d = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    const members = d?.type === 'TSInterfaceDeclaration' && d.id.name === 'Props' ? d.body.body : d?.type === 'TSTypeAliasDeclaration' && d.id.name === 'Props' && d.typeAnnotation.type === 'TSTypeLiteral' ? d.typeAnnotation.members : null;
    for (const m of members ?? []) if (m.key?.name) types.set(m.key.name, m);
  }
  traverse(ast, {
    VariableDeclarator(p) {
      if (memberText(p.node.init) !== 'Astro.props' || p.node.id.type !== 'ObjectPattern') return;
      for (const prop of p.node.id.properties) {
        if (prop.type !== 'ObjectProperty') continue;
        const key = prop.key.name ?? prop.key.value;
        const def = prop.value.type === 'AssignmentPattern' ? prop.value.right : null;
        const t = types.get(key);
        record.props[key] = { type: t?.typeAnnotation ? text(t.typeAnnotation.typeAnnotation, 60) : 'unknown', required: t ? !t.optional && !def : !def, ...(def && { default: text(def, 40) }) };
      }
    },
    CallExpression(p) {
      const name = memberText(p.node.callee);
      const api = name && apiCall(name, p.node, text);
      if (api) record.apiCalls.push({ ...api, in: 'frontmatter', ...(p.node.loc && { line: p.node.loc.start.line }) });
    },
  });
  // Props declared only by the interface (never destructured) still belong to the component's API.
  for (const [key, t] of types) if (!record.props[key]) record.props[key] = { type: t.typeAnnotation ? text(t.typeAnnotation.typeAnnotation, 60) : 'unknown', required: !t.optional };
}
