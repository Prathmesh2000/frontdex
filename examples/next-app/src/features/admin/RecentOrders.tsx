'use client';
import { useEffect, useState } from 'react';
import { Badge, DataTable, type Column } from '@/components/ui';
import { formatDate, formatPrice } from '@/lib/format';
import { http } from '@/lib/http';
import type { Order } from '@/lib/types';

const COLUMNS: Column<Order>[] = [
  { key: 'id', header: 'Order', sortable: true },
  { key: 'status', header: 'Status', render: (o) => <Badge tone={o.status === 'cancelled' ? 'danger' : 'success'}>{o.status}</Badge> },
  { key: 'total', header: 'Total', sortable: true, render: (o) => formatPrice(o.total) },
  { key: 'createdAt', header: 'Placed', sortable: true, render: (o) => formatDate(o.createdAt) },
];

/** Latest orders table on the dashboard; also reused by the orders page. */
export function RecentOrders({ limit = 10, onSelect }: { limit?: number; onSelect?: (order: Order) => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    http
      .get<Order[]>('/orders', { params: { limit }, signal: controller.signal })
      .then((res) => setOrders(res.data))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [limit]);

  return <DataTable rows={orders} columns={COLUMNS} loading={loading} onRowClick={onSelect} emptyText="No orders yet" />;
}
