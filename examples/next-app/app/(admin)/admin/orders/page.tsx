'use client';
import { useState } from 'react';
import type { Order } from '@/lib/types';
import { OrderEditor } from '@/features/admin/OrderEditor';
import { RecentOrders } from '@/features/admin/RecentOrders';

export default function AdminOrdersPage() {
  const [selected, setSelected] = useState<Order | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <>
      <RecentOrders key={version} limit={100} onSelect={setSelected} />
      <OrderEditor order={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); setVersion((v) => v + 1); }} />
    </>
  );
}
