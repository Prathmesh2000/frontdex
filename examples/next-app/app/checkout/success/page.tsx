'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/api';

export default function () {
  const orderId = useSearchParams().get('order');
  useEffect(() => {
    trackEvent('purchase', { orderId });
  }, [orderId]);
  return (
    <section className="text-center py-20">
      <h1>Thank you!</h1>
      <p>Order {orderId} is confirmed.</p>
      <Link href={`/account/orders/${orderId}`}>Track your order</Link>
    </section>
  );
}
