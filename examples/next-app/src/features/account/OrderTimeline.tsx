'use client';
import { useEffect, useState } from 'react';
import { Badge, Card, Spinner } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib/format';
import type { Order } from '@/lib/types';
import { CartItem } from '@/features/cart/CartItem';

const POLL_MS = 15_000;
const TONE = { pending: 'warning', paid: 'success', shipped: 'success', cancelled: 'danger' } as const;

/** Order status with live polling until the order ships. */
export function OrderTimeline({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch(`/api/orders/${orderId}`, { signal: controller.signal })
        .then((r) => r.json())
        .then(setOrder)
        .catch(() => {});
    load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      clearInterval(poll);
      controller.abort();
    };
  }, [orderId]);

  if (!order) return <Spinner label="Loading order" />;
  return (
    <Card>
      <Card.Header title={`Order ${order.id}`} action={<Badge tone={TONE[order.status]}>{order.status}</Badge>} />
      <Card.Body>
        <p>Placed {formatDate(order.createdAt)} · {formatPrice(order.total)}</p>
        <ul>{order.lines.map((l) => <CartItem key={l.product.id} line={l} readOnly />)}</ul>
      </Card.Body>
    </Card>
  );
}
