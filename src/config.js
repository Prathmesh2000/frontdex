import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = 'catalogue.config.json';

const DEFAULTS = {
  title: undefined,
  include: ['.'],
  exclude: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/coverage/**',
    '**/.git/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/__tests__/**',
    '**/*.d.ts',
  ],
  output: 'catalogue.yaml',
  port: 4400,
};

export function readJsonc(file) {
  const text = fs.readFileSync(file, 'utf8');
  // tsconfig/jsconfig allow comments and trailing commas; strip them outside string literals.
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export function loadConfig(root, overrides = {}) {
  const file = path.join(root, CONFIG_FILE);
  const fromFile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const pkgFile = path.join(root, 'package.json');
  const pkg = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, 'utf8')) : {};
  const config = { ...DEFAULTS, ...fromFile, ...stripUndefined(overrides) };
  config.root = root;
  config.title ??= pkg.name ?? path.basename(root);
  config.version ??= pkg.version;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  config.framework ??= deps.next ? 'next' : 'react';
  return config;
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function initConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (fs.existsSync(file)) return { file, created: false };
  const { title, include, exclude, output, port } = loadConfig(root);
  fs.writeFileSync(file, JSON.stringify({ title, include, exclude, output, port }, null, 2) + '\n');
  return { file, created: true };
}
