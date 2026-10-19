import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { api, type ComponentRow, type PageInfo } from './api';

interface Item { label: string; hint?: string; go: () => void }

const NAV: [string, string][] = [
  ['/pages', 'Site map'],
  ['/components', 'Components'],
  ['/folders', 'Folders'],
  ['/state', 'Global state'],
  ['/health', 'Health'],
  ['/design', 'Design system'],
  ['/hooks', 'Hooks'],
  ['/changes', 'Changes'],
  ['/graph', 'Graph explorer'],
  ['/history', 'History'],
];

/**
 * Ctrl+K (or "/") jump-to box. Components come from the paged search API, so filters work here too
 * (uses:Button, hook:useQuery …); pages are matched by route or component name.
 */
export function Palette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<{ comps: ComponentRow[]; total: number }>({ comps: [], total: 0 });
  const pages = useRef<Record<string, PageInfo>>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName ?? '');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    if (!pages.current) api.pages().then((p) => (pages.current = p), () => {});
  }, [open]);

  // Debounced so typing a filter does not fire a request per keystroke.
  useEffect(() => {
    if (!open || !q.trim()) return setHits({ comps: [], total: 0 });
    let live = true;
    const t = setTimeout(() => api.components({ q: q.trim(), limit: 12 }).then((p) => live && setHits({ comps: p.items, total: p.total }), () => {}), 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  if (!open) return null;
  const close = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const term = q.trim().toLowerCase();
  const isFilter = /\w+:/.test(term);
  const groups: [string, Item[]][] = term
    ? [
        ['Filter', isFilter ? [{ label: `Show all ${hits.total} matching components`, hint: q.trim(), go: close(() => navigate({ to: '/components', search: { q: q.trim() } })) }] : []],
        [
          'Pages',
          isFilter
            ? []
            : Object.entries(pages.current ?? {})
                .filter(([r, p]) => r.toLowerCase().includes(term) || (p.component ?? '').toLowerCase().includes(term))
                .slice(0, 6)
                .map(([r, p]) => ({ label: r, hint: p.component?.split('@')[0], go: close(() => navigate({ to: '/page', search: { route: r } })) })),
        ],
        ['Components', hits.comps.map((c) => ({ label: c.name, hint: c.file, go: close(() => navigate({ to: '/c/$id', params: { id: c.id } })) }))],
        ['Go to', NAV.filter(([, l]) => l.toLowerCase().includes(term)).map(([to, label]) => ({ label, go: close(() => navigate({ to })) }))],
      ]
    : [['Go to', NAV.map(([to, label]) => ({ label, go: close(() => navigate({ to })) }))]];
  const shown = groups.filter(([, items]) => items.length);
  const items = shown.flatMap(([, list]) => list);
  const at = Math.min(sel, Math.max(0, items.length - 1));
  let n = 0;

  return (
    <div className="palette" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="pal-box" role="dialog" aria-label="Search">
        <input
          autoFocus
          type="search"
          value={q}
          placeholder="Jump to… try: /checkout, CartDrawer, uses:Button, issue:memory-leak"
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length));
            } else if (e.key === 'Enter') items[at]?.go();
          }}
        />
        <div className="pal-results">
          {shown.length ? (
            shown.map(([title, list]) => (
              <div key={title}>
                <div className="pal-group">{title}</div>
                {list.map((it) => {
                  const i = n++;
                  return (
                    <a key={i} href="#" className={`pal-item${i === at ? ' sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={(e) => (e.preventDefault(), it.go())}>
                      <span className="nm">{it.label}</span>
                      {it.hint && <span className="hint">{it.hint}</span>}
                    </a>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="pal-empty">No results.</div>
          )}
        </div>
        <div className="pal-foot">
          <span>↑↓ move · ↵ open · Esc close</span>
        </div>
      </div>
    </div>
  );
}
