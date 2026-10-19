'use client';
import { memo, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Button, Card, Input } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import type { CartLine } from '@/lib/types';
import { useAppDispatch } from '@/store/hooks';
import { applyCoupon } from '@/store/cartSlice';

const COUPON_RE = /^[A-Z0-9]{4,12}$/;
const SHIPPING_FREE_FROM = 5000;

interface OrderSummaryProps {
  lines: CartLine[];
  coupon: string | null;
  /** Hide the coupon field (e.g. on the success page) */
  readOnly?: boolean;
}

/** Totals, shipping and coupon entry. */
export const OrderSummary = memo(function OrderSummary({ lines, coupon, readOnly = false }: OrderSummaryProps) {
  const dispatch = useAppDispatch();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0), [lines]);
  const discount = coupon ? Math.round(subtotal * 0.1) : 0;
  const shipping = subtotal >= SHIPPING_FREE_FROM ? 0 : 499;
  const total = subtotal - discount + shipping;

  const handleApply = () => {
    const normalized = code.trim().toUpperCase();
    if (!COUPON_RE.test(normalized)) return setCodeError('Codes are 4–12 letters or digits');
    setCodeError(null);
    dispatch(applyCoupon(normalized));
  };

  return (
    <Card>
      <Card.Header title="Order summary" />
      <Card.Body>
        <dl>
          <dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd>
          {discount > 0 && (<><dt>Discount ({coupon})</dt><dd className="text-green-600">−{formatPrice(discount)}</dd></>)}
          <dt>Shipping</dt><dd className={clsx({ 'line-through text-gray-400': shipping === 0 })}>{shipping ? formatPrice(shipping) : 'Free'}</dd>
          <dt>Total</dt><dd className="text-xl font-bold">{formatPrice(total)}</dd>
        </dl>
        {!readOnly && (
          <div className="flex gap-2">
            <Input label="Coupon" value={code} pattern="[A-Za-z0-9]{4,12}" error={codeError ?? undefined} onChange={(e) => setCode(e.target.value)} />
            <Button variant="secondary" onClick={handleApply}>Apply</Button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
});
