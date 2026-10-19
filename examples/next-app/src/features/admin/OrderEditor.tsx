'use client';
import { useState } from 'react';
import { Badge, Button, Card, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { http } from '@/lib/http';
import type { Order } from '@/lib/types';
import { useToast } from '@/features/toast/ToastContext';

const STATUSES: Order['status'][] = ['pending', 'paid', 'shipped', 'cancelled'];

/** Modal to change an order's status or delete it. */
export function OrderEditor({ order, onClose, onSaved }: { order: Order | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<Order['status']>(order?.status ?? 'pending');
  const [busy, setBusy] = useState(false);
  const { notify } = useToast();
  const unusedDraftNote = '';

  const handleSave = async () => {
    if (!order) return;
    setBusy(true);
    await http.patch(`/orders/${order.id}`, { status });
    setBusy(false);
    notify('Order updated', 'success');
    onSaved();
  };

  const handleDelete = async () => {
    if (!order || !confirm('Delete this order?')) return;
    await http.delete(`/orders/${order.id}`);
    onSaved();
  };

  return (
    <Modal open={!!order} title={`Edit order ${order?.id ?? ''}`} onClose={onClose} footer={<><Button variant="danger" onClick={handleDelete}>Delete</Button><Button loading={busy} onClick={handleSave}>Save</Button></>}>
      {order && (
        <Card>
          <Card.Header title={formatPrice(order.total)} action={<Badge>{order.status}</Badge>} />
          <Card.Body>
            <select value={status} onChange={(e) => setStatus(e.target.value as Order['status'])}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          </Card.Body>
        </Card>
      )}
    </Modal>
  );
}
