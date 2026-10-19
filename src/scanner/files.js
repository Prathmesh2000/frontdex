import fs from 'node:fs';
import path from 'node:path';

// .vue and .svelte files go through their adapters (scanner/adapters/); everything else through Babel.
export const SOURCE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.vue', '.svelte'];
export const STYLE_EXT = ['.css', '.scss', '.sass', '.less'];

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/**
 * One walk over the include roots, returning source files and stylesheets (absolute paths, sorted).
 * Uses directory entries instead of a stat per entry, which dominated no-change rescans; only symlinks are stat'ed.
 */
export function listProjectFiles(config) {
  const excludes = config.exclude.map(globToRegExp);
  const isExcluded = (rel) => excludes.some((re) => re.test(rel) || re.test(rel + '/'));
  const sources = new Set();
  const styles = new Set();

  const addFile = (abs) => {
    const ext = path.extname(abs);
    if (SOURCE_EXT.includes(ext)) sources.add(abs);
    else if (STYLE_EXT.includes(ext)) styles.add(abs);
  };
  const walkDir = (dir, relDir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (isExcluded(rel)) continue;
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        const stat = fs.statSync(abs, { throwIfNoEntry: false });
        if (!stat) continue;
        isDir = stat.isDirectory();
      } else if (!isDir && !entry.isFile()) continue;
      if (isDir) walkDir(abs, rel);
      else addFile(abs);
    }
  };

  for (const inc of config.include) {
    const abs = path.resolve(config.root, inc);
    const rel = path.relative(config.root, abs).split(path.sep).join('/');
    if (rel && isExcluded(rel)) continue;
    const stat = fs.statSync(abs, { throwIfNoEntry: false });
    if (stat?.isDirectory()) walkDir(abs, rel);
    else if (stat) addFile(abs);
  }
  return { sources: [...sources].sort(), styles: [...styles].sort() };
}

/**
 * Applies watcher-reported paths to a previous listProjectFiles() result without walking the tree.
 * Falls back to a full walk when a reported path is a directory, or is gone and was not a known file (a deleted or
 * renamed folder), because only a walk can tell which files it held.
 */
export function updateProjectFiles(config, previous, changed) {
  const excludes = config.exclude.map(globToRegExp);
  const sources = new Set(previous.sources);
  const styles = new Set(previous.styles);
  for (const abs of changed) {
    const rel = path.relative(config.root, abs).split(path.sep).join('/');
    const ext = path.extname(abs);
    const list = SOURCE_EXT.includes(ext) ? sources : STYLE_EXT.includes(ext) ? styles : null;
    const stat = fs.statSync(abs, { throwIfNoEntry: false });
    if (stat?.isDirectory() || (!stat && !list)) return listProjectFiles(config);
    if (!list) continue;
    if (stat?.isFile() && !excludes.some((re) => re.test(rel)) && config.include.some((inc) => isInside(path.resolve(config.root, inc), abs))) list.add(abs);
    else list.delete(abs);
  }
  return { sources: [...sources].sort(), styles: [...styles].sort() };
}

const isInside = (dir, file) => file === dir || file.startsWith(dir + path.sep);
