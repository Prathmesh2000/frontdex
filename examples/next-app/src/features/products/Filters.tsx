'use client';
import { useReducer } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Input } from '@/components/ui';

interface FilterState { category: string; minPrice: string; maxPrice: string; inStock: boolean }
type FilterAction = { type: 'set'; field: keyof FilterState; value: string | boolean } | { type: 'reset' };

const EMPTY: FilterState = { category: 'all', minPrice: '', maxPrice: '', inStock: false };

function filtersReducer(state: FilterState, action: FilterAction): FilterState {
  if (action.type === 'reset') return EMPTY;
  return { ...state, [action.field]: action.value };
}

/** Sidebar filters; applies them to the URL query string. */
export function Filters({ categories }: { categories: string[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, dispatch] = useReducer(filtersReducer, { ...EMPTY, category: params.get('category') ?? 'all' });

  const handleApply = () => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && v !== 'all' && next.set(k, String(v)));
    router.push(`${pathname}?${next}`);
  };

  return (
    <aside className="filters">
      <select value={filters.category} onChange={(e) => dispatch({ type: 'set', field: 'category', value: e.target.value })}>
        {['all', ...categories].map((c) => <option key={c}>{c}</option>)}
      </select>
      <Input label="Min price" type="number" min={0} value={filters.minPrice} onChange={(e) => dispatch({ type: 'set', field: 'minPrice', value: e.target.value })} />
      <Input label="Max price" type="number" min={0} value={filters.maxPrice} onChange={(e) => dispatch({ type: 'set', field: 'maxPrice', value: e.target.value })} />
      <label><input type="checkbox" checked={filters.inStock} onChange={(e) => dispatch({ type: 'set', field: 'inStock', value: e.target.checked })} /> In stock only</label>
      <Button onClick={handleApply}>Apply</Button>
      <Button variant="ghost" onClick={() => dispatch({ type: 'reset' })}>Reset</Button>
    </aside>
  );
}
