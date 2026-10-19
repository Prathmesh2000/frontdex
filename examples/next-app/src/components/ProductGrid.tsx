'use client';
import { useEffect, useMemo, useState } from 'react';
import { ProductCard, type Product } from './ProductCard';

type Props = {
  /** Category slug used to filter the API call */
  category: string;
  pageSize?: number;
};

export default function ProductGrid({ category, pageSize = 12 }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/products?c=${category}&n=${pageSize}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setProducts(data))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [category, pageSize]);

  const sorted = useMemo(() => [...products].sort((a, b) => a.price - b.price), [products]);

  if (loading) return <p>Loading…</p>;
  return <div className="grid">{sorted.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}
