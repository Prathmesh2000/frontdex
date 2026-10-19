import path from 'node:path';
import { scanProject } from './scanner/graph.js';
import { mergeManual, readCatalogue, writeCatalogue } from './spec.js';

export { loadConfig, initConfig } from './config.js';
export { scanProject } from './scanner/graph.js';
export { readCatalogue, writeCatalogue, validateCatalogue, mergeManual } from './spec.js';

export function generate(config) {
  const file = path.resolve(config.root, config.output);
  let prev = null;
  try {
    prev = readCatalogue(file);
  } catch {
    prev = null;
  }
  const { catalogue, warnings, stats } = scanProject(config);
  mergeManual(catalogue, prev);
  const sameAsBefore = prev && stableJson(prev) === stableJson(catalogue);
  if (sameAsBefore) catalogue.info.generatedAt = prev.info.generatedAt;
  else writeCatalogue(file, catalogue);
  return { file, catalogue, warnings, stats, changed: !sameAsBefore };
}

function stableJson(cat) {
  return JSON.stringify({ ...cat, info: { ...cat.info, generatedAt: undefined } });
}
