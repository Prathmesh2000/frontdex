'use client';
import { useEffect, useState } from 'react';
import { getProducts } from '@/lib/api';
import type { Product } from '@/lib/types';
import { ProductCard } from './ProductCard';

/** "You may also like" strip. */
export function RelatedProducts({ category, excludeId, limit = 4 }: { category: string; excludeId: string; limit?: number }) {
  const [items, setItems] = useState<Product[]>([]);

  useEffect(() => {
    let ignore = false;
    getProducts(`category=${category}&limit=${limit + 1}`).then((list) => {
      // demo: stale closure for the catalogue — excludeId is used here but missing from the deps array.
      if (!ignore) setItems(list.filter((p) => p.id !== excludeId).slice(0, limit));
    });
    return () => {
      ignore = true;
    };
  }, [category, limit]);

  return <div className="related grid grid-cols-4 gap-4">{items.map((p) => <ProductCard key={p.id} product={p} compact />)}</div>;
}
