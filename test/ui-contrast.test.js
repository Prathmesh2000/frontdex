import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../ui/styles.css', import.meta.url), 'utf8');

// WCAG relative luminance uses linear sRGB channels, not their encoded values.
function luminance(hex) {
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
  const channels = full.match(/../g).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
}

for (const [theme, selector] of [
  ['light', ':root'],
  ['automatic dark', ":root:not([data-theme='light'])"],
  ['explicit dark', ":root[data-theme='dark']"],
]) {
  test(`selected filter label and count meet 4.5:1 contrast in ${theme} theme`, () => {
    const declarations = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const foreground = declarations.match(/--fchip-text:\s*#([\da-f]+)/i)?.[1];
    const background = declarations.match(/--accent:\s*#([\da-f]+)/i)?.[1];
    assert.ok(foreground && background, 'theme defines selected chip colors');
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    const contrast = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(contrast >= 4.5, `contrast ${contrast.toFixed(2)}:1 must be at least 4.5:1`);
    assert.match(css, /\.fchip\.on\s*\{[^}]*background:\s*var\(--accent\);[^}]*color:\s*var\(--fchip-text\);/);
    assert.match(css, /\.fchip\.on \.muted\s*\{\s*color:\s*inherit;\s*\}/);
  });
}
