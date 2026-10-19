'use client';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Spinner } from '@/components/ui';
import { fetcher } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAppDispatch } from '@/store/hooks';
import { addItem } from '@/store/cartSlice';
import { useToast } from '@/features/toast/ToastContext';
import { ProductCard } from './ProductCard';

interface ProductGridProps {
  category?: string;
  sort?: 'price' | 'rating' | 'newest';
  pageSize?: number;
}

/** Responsive grid of products for a category. Column count follows the container width. */
export function ProductGrid({ category = 'all', sort = 'newest', pageSize = 24 }: ProductGridProps) {
  const { data: products, error, isLoading } = useSWR<Product[]>(`/api/products?category=${category}&sort=${sort}&limit=${pageSize}`, fetcher);
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const dispatch = useAppDispatch();
  const { notify } = useToast();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => setColumns(Math.max(1, Math.floor(entry.contentRect.width / 260))));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleAdd = (product: Product) => {
    dispatch(addItem(product));
    notify(`${product.name} added to cart`, 'success');
  };

  if (isLoading) return <Spinner label="Loading products" />;
  if (error) return <p className="error">Could not load products.</p>;
  return (
    <div ref={containerRef} className="grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {products?.map((p) => <ProductCard key={p.id} product={p} onAdd={handleAdd} highlight={p.rating && p.rating > 4.5 ? 'Top rated' : undefined} />)}
    </div>
  );
}
