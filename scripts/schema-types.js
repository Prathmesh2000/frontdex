// Generates spec/catalogue.d.ts from spec/catalogue.schema.json, so the published types cannot drift from the schema
// (test/types.test.js fails when the committed file is stale). Covers only the JSON Schema keywords the schema uses:
// type, enum, $ref, properties, required, items, min/maxItems, additionalProperties, patternProperties, description.
//   npm run gen:types
import fs from 'node:fs';

const SCHEMA = new URL('../spec/catalogue.schema.json', import.meta.url);
const OUT = new URL('../spec/catalogue.d.ts', import.meta.url);

const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
const doc = (s, pad) => (s.description ? `${pad}/** ${s.description.replace(/\*\//g, '*\\/')} */\n` : '');
const wrap = (t) => (/[|&]/.test(t) ? `(${t})` : t);

/** The TypeScript type of one schema node; `pad` indents nested object members. */
function ts(s, pad = '') {
  if (!s || s === true) return 'unknown';
  if (s.$ref) return s.$ref.replace('#/definitions/', '');
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (Array.isArray(s.type)) return s.type.map((t) => ts({ ...s, type: t }, pad)).join(' | ');
  switch (s.type) {
    case 'string':
    case 'boolean':
    case 'null':
      return s.type;
    case 'number':
    case 'integer':
      return 'number';
    case 'array': {
      const item = ts(s.items, pad);
      // Fixed-length pairs ([a, b] duplicates) read better as tuples.
      if (s.minItems && s.minItems === s.maxItems && s.maxItems <= 4) return `[${Array(s.maxItems).fill(item).join(', ')}]`;
      return `${wrap(item)}[]`;
    }
    default:
      return s.properties || s.additionalProperties !== undefined || s.patternProperties || s.type === 'object' ? object(s, pad) : 'unknown';
  }
}

function object(s, pad) {
  const inner = `${pad}  `;
  const required = new Set(s.required ?? []);
  const lines = Object.entries(s.properties ?? {}).map(([k, p]) => `${doc(p, inner)}${inner}${key(k)}${required.has(k) ? '' : '?'}: ${ts(p, inner)};`);
  for (const pattern of Object.keys(s.patternProperties ?? {})) {
    // ^x- keys are the spec's extension point: anything goes.
    lines.push(pattern === '^x-' ? `${inner}[k: \`x-\${string}\`]: unknown;` : `${inner}[k: string]: unknown;`);
  }
  const extra = s.additionalProperties;
  if (extra && extra !== true && !s.properties) lines.push(`${inner}[k: string]: ${ts(extra, inner)};`);
  else if ((extra === true || (extra && s.properties)) && !lines.some((l) => l.includes('[k: string]'))) lines.push(`${inner}[k: string]: unknown;`);
  return lines.length ? `{\n${lines.join('\n')}\n${pad}}` : 'Record<string, never>';
}

/** The whole declaration file: the root document as `Catalogue`, then every definition under its own name. */
export function generate(schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'))) {
  const named = (name, s) => {
    const body = ts(s);
    return `${doc(s, '')}export ${body.startsWith('{') ? `interface ${name} ${body}` : `type ${name} = ${body};`}`;
  };
  const decls = [named('Catalogue', { ...schema, description: schema.title ?? 'A frontdex catalogue document.' }), ...Object.entries(schema.definitions ?? {}).map(([name, s]) => named(name, s))];
  return `// Generated from spec/catalogue.schema.json by scripts/schema-types.js. Do not edit: run \`npm run gen:types\`.\n\n${decls.join('\n\n')}\n`;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('schema-types.js')) {
  fs.writeFileSync(OUT, generate());
  console.log(`wrote ${OUT.pathname}`);
}
