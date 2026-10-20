import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

/*
 * `frontdex fix`: the automatic fixes that cannot change behaviour.
 *   unused imports        remove the specifier (and the import when nothing is left; side effects are kept, because
 *                         an `import 'x'` line is never touched and specifier-less imports are not reported as unused)
 *   exact token drift     with --tokens: replace a literal in a stylesheet by var(--token) when the value is identical
 *                         (near matches, Tailwind and theme tokens need a human)
 * Every fix is planned first; --dry-run prints the plan without writing.
 */

/** Plans fixes from a catalogue: [{ file, kind, line, from, to, apply(text) → text }]. */
export function planFixes(config, catalogue, { tokens = false } = {}) {
  const fixes = [];
  const byFile = new Map();
  for (const u of catalogue.health?.unusedImports ?? []) (byFile.get(u.file) ?? byFile.set(u.file, []).get(u.file)).push(u);
  for (const [file, unused] of byFile) {
    for (const u of unused) fixes.push({ file, kind: 'unused-import', line: u.line, from: `${u.name} from '${u.source}'`, to: '(removed)', apply: (text) => removeImport(text, file, u.name) });
  }
  if (tokens) {
    for (const d of catalogue.tokens?.drift ?? []) {
      if (d.match !== 'exact' || !d.use.startsWith('var(') || !/\.(css|scss|sass|less)$/.test(d.at.split(':')[0])) continue;
      const [file, lineText] = [d.at.slice(0, d.at.lastIndexOf(':')), d.at.slice(d.at.lastIndexOf(':') + 1)];
      const line = Number(lineText);
      fixes.push({ file, kind: 'token-drift', line, from: d.value, to: d.use, apply: (text) => replaceOnLine(text, line, d.value, d.use) });
    }
  }
  return fixes.map((f) => ({ ...f, abs: path.join(config.root, f.file) }));
}

/** Applies planned fixes file by file; returns the fixes that actually changed something. */
export function applyFixes(fixes) {
  const applied = [];
  const byFile = new Map();
  for (const f of fixes) (byFile.get(f.abs) ?? byFile.set(f.abs, []).get(f.abs)).push(f);
  for (const [abs, list] of byFile) {
    let text = fs.readFileSync(abs, 'utf8');
    const original = text;
    // Bottom-up, so earlier line numbers stay valid while later lines change.
    for (const f of list.sort((a, b) => b.line - a.line)) {
      const next = f.apply(text);
      if (next !== text) applied.push(f);
      text = next;
    }
    if (text !== original) fs.writeFileSync(abs, text);
  }
  return applied;
}

/** Removes one imported name; drops the whole declaration when it was the only specifier. */
export function removeImport(text, file, name) {
  const plugins = /\.tsx?$/.test(file) ? ['typescript', ...(file.endsWith('x') ? ['jsx'] : [])] : ['jsx'];
  let ast;
  try {
    ast = parse(text, { sourceType: 'module', plugins: [...plugins, 'decorators-legacy'], errorRecovery: true });
  } catch {
    return text;
  }
  for (const stmt of ast.program.body) {
    if (stmt.type !== 'ImportDeclaration') continue;
    const spec = stmt.specifiers.find((s) => s.local.name === name);
    if (!spec) continue;
    if (stmt.specifiers.length === 1) {
      const end = text[stmt.end] === '\n' ? stmt.end + 1 : text.slice(stmt.end, stmt.end + 2) === '\r\n' ? stmt.end + 2 : stmt.end;
      return text.slice(0, stmt.start) + text.slice(end);
    }
    // Remove the specifier with one adjacent comma: the following one, or the preceding one for the last specifier.
    const i = stmt.specifiers.indexOf(spec);
    const named = stmt.specifiers.filter((s) => s.type === 'ImportSpecifier');
    if (spec.type === 'ImportSpecifier' && named.length === 1) {
      // `import Def, { x } from` → `import Def from`
      const open = text.lastIndexOf('{', spec.start);
      const close = text.indexOf('}', spec.end);
      const comma = text.lastIndexOf(',', open);
      return text.slice(0, comma) + text.slice(close + 1);
    }
    if (spec.type !== 'ImportSpecifier') {
      // `import Def, { a } from` / `import Def, * as ns from` → drop "Def, "
      let end = text.indexOf(',', spec.end) + 1;
      while (/\s/.test(text[end])) end++;
      return text.slice(0, spec.start) + text.slice(end);
    }
    const next = stmt.specifiers[i + 1];
    if (next) return text.slice(0, spec.start) + text.slice(next.start);
    const prev = stmt.specifiers[i - 1];
    return text.slice(0, prev.end) + text.slice(spec.end);
  }
  return text;
}

function replaceOnLine(text, line, from, to) {
  const lines = text.split('\n');
  const i = line - 1;
  if (!lines[i]?.includes(from)) return text;
  lines[i] = lines[i].replace(from, to);
  return lines.join('\n');
}
