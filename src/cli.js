import path from 'node:path';
import { parseArgs } from 'node:util';
import { generate, initConfig, loadConfig, readCatalogue, validateCatalogue } from './index.js';
import { buildSite, startServer } from './server.js';

const HELP = `rcat — catalogue for React / Next.js frontends

Usage: rcat <command> [options]

Commands
  init                Create catalogue.config.json in the project
  generate            Scan the project and write catalogue.yaml
  validate [file]     Validate a catalogue file against CatalogueSpec 1.0
  serve               Generate, then serve the catalogue UI
  build               Export the catalogue UI as a static site

Options
  -C, --cwd <dir>     Project root (default: current directory)
  -o, --out <path>    Output file (generate) or directory (build, default: catalogue-site)
  -p, --port <n>      Port for serve (default: 4400)
  -w, --watch         Regenerate when source files change (serve)
      --no-generate   Serve the existing catalogue file without rescanning
  -h, --help          Show this help
`;

export async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      cwd: { type: 'string', short: 'C' },
      out: { type: 'string', short: 'o' },
      port: { type: 'string', short: 'p' },
      watch: { type: 'boolean', short: 'w' },
      'no-generate': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, arg] = positionals;
  if (values.help || !command) return void console.log(HELP);

  const root = path.resolve(values.cwd ?? process.cwd());
  const config = loadConfig(root, command === 'generate' ? { output: values.out } : {});

  switch (command) {
    case 'init': {
      const { file, created } = initConfig(root);
      console.log(created ? `✔ created ${path.relative(process.cwd(), file)}` : `• ${file} already exists`);
      return;
    }
    case 'generate': {
      const { file, stats, warnings, changed } = generate(config);
      warnings.forEach((w) => console.warn(`⚠ ${w}`));
      console.log(`✔ ${stats.components} components, ${stats.pages} pages from ${stats.files} files → ${path.relative(process.cwd(), file)}${changed ? '' : ' (unchanged)'}`);
      return;
    }
    case 'validate': {
      const file = path.resolve(root, arg ?? config.output);
      const catalogue = readCatalogue(file);
      if (!catalogue) throw new Error(`File not found: ${file}`);
      const { valid, errors } = validateCatalogue(catalogue);
      if (valid) return void console.log(`✔ ${path.relative(process.cwd(), file)} is valid CatalogueSpec 1.0`);
      errors.forEach((e) => console.error(`✖ ${e}`));
      process.exitCode = 1;
      return;
    }
    case 'serve': {
      const port = Number(values.port ?? config.port);
      await startServer(config, { port, watch: values.watch, regenerate: !values['no-generate'] });
      console.log(`✔ catalogue running at http://localhost:${port}${values.watch ? '  (watching for changes)' : ''}`);
      return;
    }
    case 'build': {
      const { catalogue } = generate(config);
      const out = path.resolve(root, values.out ?? 'catalogue-site');
      buildSite(config, catalogue, out);
      console.log(`✔ static catalogue written to ${path.relative(process.cwd(), out)}/`);
      return;
    }
    default:
      console.error(`Unknown command "${command}".\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}
