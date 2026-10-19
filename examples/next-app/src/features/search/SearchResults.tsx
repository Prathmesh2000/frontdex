'use client';
import useSWR from 'swr';
import { Spinner } from '@/components/ui';
import { fetcher } from '@/lib/api';
import type { Product } from '@/lib/types';
import { ProductCard } from '@/features/products/ProductCard';

/** Results list for a search term; re-fetches as the term changes. */
export function SearchResults({ term, limit = 30 }: { term: string; limit?: number }) {
  const { data, isLoading } = useSWR<Product[]>(term ? `/api/search?q=${encodeURIComponent(term)}&limit=${limit}` : null, fetcher, { keepPreviousData: true });
  const count = data?.length ?? 0;

  if (!term) return <p className="hint">Type at least two characters.</p>;
  if (isLoading && !data) return <Spinner label="Searching" />;
  return (
    <section>
      <p>{count} result{count === 1 ? '' : 's'} for “{term}”</p>
      <div className="grid">{data?.map((p) => <ProductCard key={p.id} product={p} compact />)}</div>
    </section>
  );
}
