'use client';
import { useState, useTransition } from 'react';
import { Button, Input } from '@/components/ui';
import { trackEvent } from '@/lib/api';
import type { Product } from '@/lib/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addItem, updateQuantity } from '@/store/cartSlice';
import { useToast } from '@/features/toast/ToastContext';

/** Quantity picker + add button for the product page. */
export function AddToCartButton({ product, maxQuantity = 10 }: { product: Product; maxQuantity?: number }) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const inCart = useAppSelector((s) => s.cart.items.some((l) => l.product.id === product.id));
  const dispatch = useAppDispatch();
  const { notify } = useToast();

  const handleAdd = () => {
    startTransition(() => {
      dispatch(addItem(product));
      if (quantity > 1) dispatch(updateQuantity({ id: product.id, quantity }));
      trackEvent('add_to_cart', { id: product.id, quantity });
      notify(`Added ${quantity} × ${product.name}`, 'success');
    });
  };

  return (
    <div className="flex gap-2 items-end">
      <Input label="Qty" type="number" min={1} max={maxQuantity} required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      <Button onClick={handleAdd} loading={isPending} disabled={product.stock === 0}>{inCart ? 'Add another' : 'Add to cart'}</Button>
    </div>
  );
}
