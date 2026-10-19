import { memo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import type { CartLine } from '@/lib/types';
import { useAppDispatch } from '@/store/hooks';
import { removeItem, updateQuantity } from '@/store/cartSlice';

/** One cart line with quantity stepper and remove button. */
export const CartItem = memo(function CartItem({ line, readOnly = false }: { line: CartLine; readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const subtotal = line.product.price * line.quantity;
  const onStep = (delta: number) => dispatch(updateQuantity({ id: line.product.id, quantity: line.quantity + delta }));

  return (
    <li className="cart-item flex items-center gap-3">
      <Image src={line.product.image} alt="" width={56} height={56} />
      <span>{line.product.name}</span>
      {readOnly ? <span>× {line.quantity}</span> : (
        <span className="stepper">
          <button onClick={() => onStep(-1)} disabled={line.quantity <= 1}>−</button>
          {line.quantity}
          <button onClick={() => onStep(1)}>+</button>
        </span>
      )}
      <strong>{formatPrice(subtotal)}</strong>
      {!readOnly && <Button variant="ghost" size="sm" onClick={() => dispatch(removeItem(line.product.id))}>Remove</Button>}
    </li>
  );
});
