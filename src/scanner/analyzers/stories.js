import fs from 'node:fs';
import { parse } from '@babel/parser';

/*
 * Storybook / Ladle stories (Component Story Format) read as usage examples: each named export is a story, and its
 * `args` show real props a component is used with. Story files are excluded from the scan itself (they are not app
 * code), so they are read here on demand, cached by mtime.
 */

const cache = new Map();
const MAX_ARG = 60;

function literal(node, code) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') return JSON.stringify(node.value);
  if (node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return String(node.value);
  const text = code.slice(node.start, node.end).replace(/\s+/g, ' ');
  return text.length > MAX_ARG ? `${text.slice(0, MAX_ARG - 1)}…` : text;
}

const argsOf = (obj, code) => {
  const args = obj?.type === 'ObjectExpression' ? obj.properties.find((p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'args')?.value : null;
  if (args?.type !== 'ObjectExpression') return undefined;
  return Object.fromEntries(args.properties.filter((p) => p.type === 'ObjectProperty').map((p) => [p.key.name ?? p.key.value, literal(p.value, code)]));
};

/** Stories in one CSF file: [{ name, args? }] in source order. */
export function readStories(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return [];
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.stories;
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
  } catch {
    return [];
  }
  const stories = [];
  const byName = new Map();
  let defaultArgs;
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      let d = stmt.declaration;
      while (d.type === 'TSAsExpression' || d.type === 'TSSatisfiesExpression') d = d.expression;
      defaultArgs = argsOf(d, code);
    }
    const decl = stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'VariableDeclaration' ? stmt.declaration : null;
    for (const d of decl?.declarations ?? []) {
      let init = d.init;
      while (init?.type === 'TSAsExpression' || init?.type === 'TSSatisfiesExpression') init = init.expression;
      const story = { name: d.id.name, ...(argsOf(init, code) && { args: argsOf(init, code) }) };
      stories.push(story);
      byName.set(story.name, story);
    }
    // CSF2: `Primary.args = { … }`
    const e = stmt.type === 'ExpressionStatement' ? stmt.expression : null;
    if (e?.type === 'AssignmentExpression' && e.left.type === 'MemberExpression' && e.left.property.name === 'args' && byName.has(e.left.object.name) && e.right.type === 'ObjectExpression') {
      byName.get(e.left.object.name).args = argsOf({ type: 'ObjectExpression', properties: [{ type: 'ObjectProperty', key: { name: 'args' }, value: e.right }] }, code);
    }
  }
  // Story args extend the default export's args.
  const out = stories.map((s) => (defaultArgs || s.args ? { ...s, args: { ...defaultArgs, ...s.args } } : s));
  cache.set(file, { mtimeMs: stat.mtimeMs, stories: out });
  return out;
}
