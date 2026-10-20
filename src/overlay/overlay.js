// frontdex dev overlay: hold Alt and hover any element of a running React app to see which component rendered it, where
// it lives and its props; Alt+click opens it in the catalogue UI. Plain JS with no imports, so it runs in any bundler
// or straight from a <script> tag. Load it in development only:
//   if (process.env.NODE_ENV === 'development') import('frontdex/overlay');
// The Vite plugin injects it by itself with `frontdex({ overlay: true })`.

const PROP_LIMIT = 8;
const VALUE_LIMIT = 60;

/**
 * Where the catalogue UI and API live: next to this script when it was served by frontdex (Vite's /__frontdex/ or
 * `frontdex serve`), otherwise `frontdex serve` on its default port. `window.__FRONTDEX_URL__` overrides both.
 */
function defaultBase() {
  if (typeof window !== 'undefined' && window.__FRONTDEX_URL__) return String(window.__FRONTDEX_URL__).replace(/\/?$/, '/');
  try {
    const self = new URL(import.meta.url);
    if (/^https?:$/.test(self.protocol) && self.pathname.endsWith('/overlay.js')) return new URL('./', self).href;
  } catch {
    // Bundled: import.meta.url names the bundle, not frontdex.
  }
  return 'http://localhost:4400/';
}

// React attaches the fiber to DOM nodes under a key with a random suffix (React 17+).
const fiberOf = (node) => {
  for (let n = node; n; n = n.parentNode) {
    const key = Object.keys(n).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (key) return n[key];
  }
  return null;
};

/** The component a fiber belongs to: function and class components, through memo and forwardRef wrappers. */
function nameOf(type) {
  if (!type) return null;
  if (typeof type === 'function') return type.displayName || type.name || null;
  if (typeof type === 'object') return type.displayName || nameOf(type.render) || nameOf(type.type);
  return null;
}
function componentFiber(fiber) {
  for (let f = fiber; f; f = f.return) {
    const name = typeof f.type !== 'string' && nameOf(f.type);
    // Single-letter names are minified or anonymous helpers; skip to a real component.
    if (name && name.length > 1) return { fiber: f, name };
  }
  return null;
}
// The component's outermost DOM node: what to outline.
function hostNode(fiber) {
  for (let f = fiber; f; f = f.child) if (f.stateNode instanceof Element) return f.stateNode;
  return null;
}

const show = (value) => {
  if (typeof value === 'function') return `ƒ ${value.name || ''}`.trim();
  if (value && typeof value === 'object') return Array.isArray(value) ? `[${value.length}]` : value.$$typeof ? '<element>' : '{…}';
  const text = JSON.stringify(value) ?? String(value);
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT)}…` : text;
};
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let started = null;

/** Installs the overlay once; later calls only change the catalogue URL. */
export function start({ url } = {}) {
  if (typeof document === 'undefined') return;
  if (started) {
    if (url) started.base = url.replace(/\/?$/, '/');
    return;
  }
  const state = (started = { base: url ? url.replace(/\/?$/, '/') : defaultBase(), current: null });
  const lookups = new Map();
  // file:line comes from the catalogue: React 19 no longer records source locations on fibers.
  const lookup = (name) => {
    if (!lookups.has(name)) {
      lookups.set(
        name,
        fetch(`${state.base}api/components?q=${encodeURIComponent(name)}&limit=20`)
          .then((r) => (r.ok ? r.json() : { items: [] }))
          .then((page) => page.items.filter((c) => c.name === name))
          .catch(() => null),
      );
    }
    return lookups.get(name);
  };

  const host = document.createElement('frontdex-overlay');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    .box { position: fixed; pointer-events: none; border: 2px solid #4f46e5; background: rgba(79,70,229,.08); border-radius: 3px; z-index: 2147483646; }
    .tip { position: fixed; pointer-events: none; z-index: 2147483647; max-width: 420px; padding: 8px 10px; border-radius: 8px;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; color: #e5e7eb; background: #111827; box-shadow: 0 8px 24px rgba(0,0,0,.3); }
    .name { font-weight: 700; color: #a5b4fc; } .file { color: #9ca3af; } .props { margin-top: 4px; } .k { color: #fbbf24; } .hint { margin-top: 4px; color: #6b7280; }
    [hidden] { display: none; }
  </style><div class="box" hidden></div><div class="tip" hidden></div>`;
  const box = root.querySelector('.box');
  const tip = root.querySelector('.tip');
  document.documentElement.appendChild(host);

  const hide = () => {
    box.hidden = tip.hidden = true;
    state.current = null;
  };
  const render = async (hit, x, y) => {
    const el = hostNode(hit.fiber);
    const rect = (el ?? document.body).getBoundingClientRect();
    Object.assign(box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const props = Object.entries(hit.fiber.memoizedProps ?? {}).filter(([k]) => k !== 'children');
    const propsHtml = props.slice(0, PROP_LIMIT).map(([k, v]) => `<div><span class="k">${escapeHtml(k)}</span>=${escapeHtml(show(v))}</div>`).join('') + (props.length > PROP_LIMIT ? `<div>+${props.length - PROP_LIMIT} more</div>` : '');
    const paint = (where) => {
      tip.innerHTML = `<div class="name">&lt;${escapeHtml(hit.name)}&gt;</div><div class="file">${where}</div>${propsHtml ? `<div class="props">${propsHtml}</div>` : ''}<div class="hint">Alt+click: open in frontdex</div>`;
      Object.assign(tip.style, { left: `${Math.min(x + 14, innerWidth - 440)}px`, top: `${Math.min(y + 14, innerHeight - tip.offsetHeight - 8)}px` });
      box.hidden = tip.hidden = false;
    };
    paint('…');
    const found = await lookup(hit.name);
    if (state.current !== hit.fiber) return;
    if (!found) paint('catalogue not reachable: run frontdex serve, or set window.__FRONTDEX_URL__');
    else if (!found.length) paint('not in the catalogue (from a package, or not scanned yet)');
    else paint(found.map((c) => escapeHtml(`${c.file}${c.line ? `:${c.line}` : ''}`)).join('<br>'));
  };

  addEventListener(
    'mousemove',
    (e) => {
      if (!e.altKey) return state.current && hide();
      const hit = componentFiber(fiberOf(e.target));
      if (!hit) return hide();
      if (hit.fiber === state.current) return;
      state.current = hit.fiber;
      render(hit, e.clientX, e.clientY);
    },
    { passive: true },
  );
  addEventListener('keyup', (e) => e.key === 'Alt' && hide());
  addEventListener('blur', hide);
  // Capture phase, so the app's own click handlers do not run for an inspecting Alt+click.
  addEventListener(
    'click',
    async (e) => {
      if (!e.altKey) return;
      const hit = componentFiber(fiberOf(e.target));
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const found = await lookup(hit.name);
      const id = found?.[0]?.id;
      open(id ? `${state.base}#/c/${encodeURIComponent(id)}` : `${state.base}#/components?q=${encodeURIComponent(hit.name)}`, 'frontdex');
    },
    true,
  );
}

if (typeof window !== 'undefined' && window.__FRONTDEX_OVERLAY__ !== false) start();
