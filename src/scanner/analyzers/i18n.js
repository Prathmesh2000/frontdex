/*
 * Hard-coded user-facing text. Collected for every component while parsing; reported only in projects that use an
 * i18n library (graph.js checks the dependencies), where literal text in markup is a missed translation.
 */

// i18n libraries whose presence means "text should go through translations".
export const I18N_LIBS = ['react-i18next', 'i18next', 'next-intl', 'react-intl', '@lingui/react', '@lingui/core', 'vue-i18n', '@nuxtjs/i18n', 'svelte-i18n', '@angular/localize', '@ngx-translate/core', 'next-i18next', 'rosetta', 'typesafe-i18n'];
// Elements whose text is code or data, not copy.
const NOT_COPY = /^(code|pre|kbd|samp|script|style|svg|path)$/;
// At least two letters in a row: skips numbers, punctuation, separators like "·" and single letters.
const WORDY = /\p{L}{2,}/u;

/** JSX text inside a component: { count, sample, line } or null. */
export function jsxText(fnPath) {
  let count = 0;
  let first = null;
  fnPath.traverse({
    JSXText(p) {
      const value = p.node.value.replace(/\s+/g, ' ').trim();
      if (!WORDY.test(value)) return;
      const parent = p.parent.type === 'JSXElement' ? p.parent.openingElement.name.name : null;
      if (parent && NOT_COPY.test(parent)) return;
      count++;
      first ??= { sample: value.length > 40 ? `${value.slice(0, 39)}…` : value, line: p.node.loc?.start.line };
    },
    // Visible attribute copy: placeholder, title, alt, aria-label as string literals.
    JSXAttribute(p) {
      const name = p.node.name.name;
      const v = p.node.value;
      if (!/^(placeholder|title|alt|aria-label|label)$/.test(name) || v?.type !== 'StringLiteral' || !WORDY.test(v.value)) return;
      count++;
      first ??= { sample: `${name}="${v.value.slice(0, 30)}"`, line: p.node.loc?.start.line };
    },
  });
  return count ? { count, ...first } : null;
}
