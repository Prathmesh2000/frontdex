import fs from 'node:fs';
import path from 'node:path';

export const SOURCE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];
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

export function listSourceFiles(config, extensions = SOURCE_EXT) {
  const excludes = config.exclude.map(globToRegExp);
  const isExcluded = (rel) => excludes.some((re) => re.test(rel) || re.test(rel + '/'));
  const files = new Set();

  const walk = (abs) => {
    const rel = path.relative(config.root, abs).split(path.sep).join('/');
    if (rel && isExcluded(rel)) return;
    const stat = fs.statSync(abs, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(abs)) walk(path.join(abs, entry));
    } else if (extensions.includes(path.extname(abs)) && !isExcluded(rel)) {
      files.add(abs);
    }
  };

  for (const inc of config.include) walk(path.resolve(config.root, inc));
  return [...files].sort();
}
