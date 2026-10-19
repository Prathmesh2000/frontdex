import fs from 'node:fs';
import path from 'node:path';
import { detectPackageManager, detectWorkspaces } from './scanner/workspace.js';

export const CONFIG_FILE = 'frontdex.config.json';
// Names from the react-catalogue era. A project that still has any of them keeps using them until `frontdex upgrade`.
export const LEGACY = { configFile: 'catalogue.config.json', output: 'catalogue.yaml', knowledgeDir: '.catalogue' };

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
  output: 'frontdex.yaml',
  port: 4400,
  autoUpdate: false,
  knowledgeDir: '.frontdex',
  history: { enabled: true, limit: 500 },
  agents: { enabled: true },
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

/** True when the project still uses react-catalogue file names and has not been upgraded. */
export function isLegacyProject(root) {
  return !fs.existsSync(path.join(root, CONFIG_FILE)) && Object.values(LEGACY).some((f) => fs.existsSync(path.join(root, f)));
}

export function loadConfig(root, overrides = {}) {
  const legacy = isLegacyProject(root);
  const file = path.join(root, legacy ? LEGACY.configFile : CONFIG_FILE);
  const fromFile = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const defaults = legacy ? { ...DEFAULTS, output: LEGACY.output, knowledgeDir: LEGACY.knowledgeDir } : DEFAULTS;
  const pkgFile = path.join(root, 'package.json');
  const pkg = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, 'utf8')) : {};
  const config = { ...defaults, ...fromFile, ...stripUndefined(overrides) };
  config.legacy = legacy;
  config.history = { ...DEFAULTS.history, ...fromFile.history };
  config.agents = { ...DEFAULTS.agents, ...fromFile.agents };
  config.root = root;
  config.title ??= pkg.name ?? path.basename(root);
  config.version ??= pkg.version;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  config.packageManager ??= detectPackageManager(root, pkg);
  // Monorepo packages, detected from the package manager's workspace config; a `workspaces` array of globs in the config overrides it.
  config.workspaces = detectWorkspaces(root, Array.isArray(fromFile.workspaces) ? { workspaces: fromFile.workspaces } : pkg);
  config.rootFramework = deps.next ? 'next' : 'react';
  config.framework ??= config.rootFramework === 'next' || config.workspaces.some((w) => w.framework === 'next') ? 'next' : 'react';
  // Where the running app is served, for the live preview panel.
  config.preview ??= config.framework === 'next' ? 'http://localhost:3000' : deps.vite ? 'http://localhost:5173' : 'http://localhost:3000';
  return config;
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function initConfig(root, { autoUpdate } = {}) {
  const file = path.join(root, isLegacyProject(root) ? LEGACY.configFile : CONFIG_FILE);
  if (fs.existsSync(file)) return { file, created: false };
  const { title, include, exclude, output, port, knowledgeDir, history, agents, ...rest } = loadConfig(root);
  const config = { title, include, exclude, output, port, autoUpdate: autoUpdate ?? rest.autoUpdate, knowledgeDir, history, agents };
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return { file, created: true };
}

/**
 * Moves a react-catalogue project to frontdex names: config file, catalogue YAML and knowledge folder.
 * Paths that were set explicitly to something else in the old config are left alone, since someone chose them.
 * Returns the [from, to] moves made.
 */
export function upgradeProject(root) {
  if (!isLegacyProject(root)) return [];
  const moves = [];
  const move = (from, to) => {
    const src = path.join(root, from);
    const dest = path.join(root, to);
    if (!fs.existsSync(src) || fs.existsSync(dest)) return;
    fs.renameSync(src, dest);
    moves.push([from, to]);
  };
  const legacyConfig = path.join(root, LEGACY.configFile);
  const data = fs.existsSync(legacyConfig) ? JSON.parse(fs.readFileSync(legacyConfig, 'utf8')) : null;
  if (!data?.output || data.output === LEGACY.output) {
    move(LEGACY.output, DEFAULTS.output);
    if (data) delete data.output;
    // The editor schema hint on the first line pointed into the old package.
    const yaml = path.join(root, DEFAULTS.output);
    if (fs.existsSync(yaml)) fs.writeFileSync(yaml, fs.readFileSync(yaml, 'utf8').replace('node_modules/react-catalogue/', 'node_modules/frontdex/'));
  }
  if (!data?.knowledgeDir || data.knowledgeDir === LEGACY.knowledgeDir) {
    move(LEGACY.knowledgeDir, DEFAULTS.knowledgeDir);
    if (data) delete data.knowledgeDir;
  }
  if (data) {
    fs.writeFileSync(path.join(root, CONFIG_FILE), JSON.stringify(data, null, 2) + '\n');
    fs.rmSync(legacyConfig);
    moves.push([LEGACY.configFile, CONFIG_FILE]);
  }
  return moves;
}
