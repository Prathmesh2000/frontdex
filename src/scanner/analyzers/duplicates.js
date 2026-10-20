/*
 * Near-duplicate components: the "Button vs LegacyButton", "two Cards in two folders" problem, and what coding agents
 * produce when they don't find an existing component. Pairs are scored on four signals:
 *   base name   names equal after dropping prefixes/suffixes such as Legacy, Old, New, Base, Custom, Component, V2
 *   name words  overlap of the camel-case words
 *   props       overlap of prop names
 *   structure   overlap of rendered children and CSS classes
 * Only pairs that share a name word, base name or two prop names are compared, so cost stays near linear.
 */

const PREFIX = /^(Legacy|Old|New|Base|Custom|My|App|Ui|UI|Shared|Common|Simple|Basic|Default|Styled|Generic)(?=[A-Z])/;
const SUFFIX = /(?<=[a-z0-9])(Component|Container|Wrapper|Legacy|Old|New|V\d+|\d+)$/;
// Words so common that sharing them says nothing (Page, Form, List…); a word used by more components than this is skipped.
const MAX_WORD_FANOUT = 30;
const MIN_SCORE = 0.55;
const MAX_PAIRS = 200;

export function baseName(name) {
  let prev;
  let out = name;
  do {
    prev = out;
    out = out.replace(PREFIX, '').replace(SUFFIX, '');
  } while (out !== prev && out);
  return out || name;
}

const words = (name) => name.split(/(?<=[a-z0-9])(?=[A-Z])|[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
};

/**
 * Existing components that match a component someone is about to create: `{ name, props? }` → [{ id, score, reasons }].
 * Same signals as findDuplicates minus structure (a planned component has none yet); the check agents run first.
 */
export function similarTo(components, { name, props = [] }, limit = 8) {
  const base = baseName(name);
  const wantWords = words(name);
  const want = new Set(wantWords);
  // The last word is usually the kind of thing (PrimaryButton → button); sharing it matters more than other words.
  const head = wantWords[wantWords.length - 1];
  const wantProps = new Set(props);
  const hits = [];
  for (const [id, c] of Object.entries(components)) {
    const sameBase = baseName(c.name).toLowerCase() === base.toLowerCase();
    const theirWords = words(c.name);
    const sameHead = !sameBase && theirWords[theirWords.length - 1] === head;
    const nameSim = jaccard(want, new Set(theirWords));
    const have = new Set(Object.keys(c.props ?? {}));
    const propSim = jaccard(wantProps, have);
    const score = Math.min(1, (sameBase ? 0.5 : sameHead ? 0.2 : 0) + 0.35 * nameSim + 0.3 * propSim);
    if (score < 0.1) continue;
    const reasons = [sameBase ? `same base name "${base}"` : sameHead ? `also a ${head}` : nameSim ? `${Math.round(nameSim * 100)}% of name words shared` : null, wantProps.size && have.size ? `${[...wantProps].filter((p) => have.has(p)).length}/${wantProps.size} wanted props exist` : null].filter(Boolean);
    hits.push({ id, score: Math.round(score * 100) / 100, reasons });
  }
  return hits.sort((a, b) => b.score - a.score || (components[b.id].usedBy?.length ?? 0) - (components[a.id].usedBy?.length ?? 0)).slice(0, limit);
}

/**
 * Returns [{ components: [a, b], score, reasons }] (best first) and adds a `possible-duplicate` issue to the less-used
 * component of each pair. Page and layout roots are left out: routes often look alike on purpose.
 */
export function findDuplicates(components, pages) {
  const routeRoots = new Set(Object.values(pages).flatMap((p) => [p.component, ...(p.layouts ?? [])]).filter(Boolean));
  const items = Object.entries(components)
    .filter(([id]) => !routeRoots.has(id))
    .map(([id, c]) => ({
      id,
      c,
      base: baseName(c.name),
      words: new Set(words(c.name)),
      props: new Set(Object.keys(c.props ?? {})),
      shape: new Set([...(c.renders ?? []).map((r) => `<${components[r]?.name ?? r}>`), ...(c.styles?.classes ?? []).map((x) => `.${x.name}`)]),
    }));

  // Blocking index: base name, name words and prop names → items.
  const index = new Map();
  const put = (key, item) => (index.get(key) ?? index.set(key, []).get(key)).push(item);
  for (const item of items) {
    put(`base:${item.base}`, item);
    for (const w of item.words) put(`word:${w}`, item);
    for (const p of item.props) put(`prop:${p}`, item);
  }
  const candidates = new Map();
  for (const [key, list] of index) {
    if (list.length < 2 || (!key.startsWith('base:') && list.length > MAX_WORD_FANOUT)) continue;
    // A base name shared by hundreds of components (an app copied per tenant) would make n² pairs; past the fan-out each
    // one is compared with the first MAX_WORD_FANOUT only, which still finds it a match and keeps the work linear.
    const width = list.length > MAX_WORD_FANOUT ? MAX_WORD_FANOUT : list.length;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (i >= width && j >= width) break;
        const [a, b] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
        const pair = `${a.id}\0${b.id}`;
        const entry = candidates.get(pair) ?? candidates.set(pair, { a, b, props: 0 }).get(pair);
        if (key.startsWith('prop:')) entry.props++;
      }
    }
  }

  const pairs = [];
  for (const { a, b, props } of candidates.values()) {
    if (a.c.file === b.c.file) continue;
    const sameBase = a.base === b.base;
    const nameSim = jaccard(a.words, b.words);
    if (!sameBase && nameSim === 0 && props < 2) continue;
    const propSim = jaccard(a.props, b.props);
    const shapeSim = jaccard(a.shape, b.shape);
    const score = Math.min(1, (sameBase ? 0.5 : 0) + 0.25 * nameSim + 0.25 * propSim + 0.2 * shapeSim);
    // A shared name alone is not enough unless it is the same base name; otherwise props or structure must agree too.
    if (score < MIN_SCORE || !(sameBase || nameSim >= 0.5 || (propSim >= 0.6 && shapeSim >= 0.5))) continue;
    const reasons = [];
    if (sameBase) reasons.push(a.c.name === b.c.name ? 'same name' : `same base name "${a.base}"`);
    else if (nameSim) reasons.push(`similar names (${Math.round(nameSim * 100)}% of words shared)`);
    if (a.props.size && b.props.size) reasons.push(`${[...a.props].filter((p) => b.props.has(p)).length}/${new Set([...a.props, ...b.props]).size} props shared`);
    if (shapeSim) reasons.push(`${Math.round(shapeSim * 100)}% of children/classes shared`);
    pairs.push({ components: [a.id, b.id], score: Math.round(score * 100) / 100, reasons });
  }
  pairs.sort((x, y) => y.score - x.score || x.components[0].localeCompare(y.components[0]));

  // One issue per component, naming its best match: one per pair grows with the square of a look-alike group.
  const best = new Map();
  for (const pair of pairs) {
    const [a, b] = pair.components.map((id) => components[id]);
    const uses = (c) => (c.usedBy?.length ?? 0) + (c.pages?.length ?? 0);
    // Report on the one fewer things depend on: it is the cheaper one to fold into the other.
    const [keepId, foldId] = uses(a) >= uses(b) ? pair.components : [...pair.components].reverse();
    const hit = best.get(foldId);
    if (hit) hit.more++;
    else best.set(foldId, { keepId, pair, more: 0 });
  }
  for (const [foldId, { keepId, pair, more }] of best) {
    const fold = components[foldId];
    const others = more ? `, and ${more} more look-alike${more === 1 ? '' : 's'}` : '';
    (fold.issues ??= []).push({ type: 'possible-duplicate', severity: 'low', message: `${fold.name} looks like ${keepId} (${pair.reasons.join('; ')})${others}`, fix: `reuse or extend ${keepId}, or merge the two` });
  }
  return pairs.slice(0, MAX_PAIRS);
}
