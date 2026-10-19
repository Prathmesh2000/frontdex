'use client';
import { useEffect, useState } from 'react';
import { Button, Input, Spinner } from '@/components/ui';
import { http } from '@/lib/http';
import type { Product } from '@/lib/types';

/** Create or edit a product. `productId` undefined means "new". */
export function ProductEditor({ productId }: { productId?: string }) {
  const [product, setProduct] = useState<Partial<Product>>({ name: '', price: 0, stock: 0, category: '' });
  const [loading, setLoading] = useState(!!productId);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    http.get<Product>(`/products/${productId}`, { signal: controller.signal }).then((res) => {
      setProduct(res.data);
      setLoading(false);
    });
    return () => controller.abort();
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (productId) await http.put(`/products/${productId}`, product);
    else await http.post('/products', product);
  };

  if (loading) return <Spinner />;
  return (
    <form onSubmit={handleSubmit}>
      <Input label="Name" required minLength={3} value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} />
      <Input label="Price (cents)" type="number" required min={0} value={product.price} onChange={(e) => setProduct({ ...product, price: Number(e.target.value) })} />
      <Input label="Stock" type="number" min={0} value={product.stock} onChange={(e) => setProduct({ ...product, stock: Number(e.target.value) })} />
      <Button type="submit">{productId ? 'Save changes' : 'Create product'}</Button>
    </form>
  );
}
