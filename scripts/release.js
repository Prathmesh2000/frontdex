// Used by .github/workflows/release.yml: dates the pending CHANGELOG section for <version> and prints its body
// (the GitHub Release notes). Pending = "## Unreleased" or "## x.y.z (unreleased)"; an already dated
// "## <version> (…)" section is left as it is, so re-running a failed release is safe.
import fs from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) throw new Error('usage: node scripts/release.js <version>');

const file = 'CHANGELOG.md';
let text = fs.readFileSync(file, 'utf8');
const escaped = version.replace(/\./g, '\\.');
if (!new RegExp(`^## ${escaped} \\(\\d{4}-\\d\\d-\\d\\d\\)`, 'm').test(text)) {
  const pending = /^## (?:Unreleased|\d+\.\d+\.\d+\S* \(unreleased\))[ \t]*$/im;
  if (!pending.test(text)) throw new Error(`${file} has no "## Unreleased" section and no "## ${version}" section`);
  text = text.replace(pending, `## ${version} (${new Date().toISOString().slice(0, 10)})`);
  fs.writeFileSync(file, text);
}
const section = text.split(new RegExp(`^## ${escaped} .*$`, 'm'))[1].split(/^## /m)[0];
process.stdout.write(section.trim() + '\n');
