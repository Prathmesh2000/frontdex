'use client';
import { useEffect } from 'react';
import { Badge } from '@/components/ui';
import { useToast, type Toast } from './ToastContext';

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  // Auto-dismiss after 4s; the timer is cleared if the toast is closed early.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div role="status" className={`toast toast-${toast.tone}`}>
      <Badge tone={toast.tone === 'error' ? 'danger' : 'success'}>{toast.tone}</Badge>
      {toast.message}
      <button onClick={() => onDismiss(toast.id)} aria-label="Dismiss">×</button>
    </div>
  );
}

/** Renders queued toasts in the corner of the screen. */
export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return <div className="toast-viewport fixed bottom-4 right-4 z-50">{toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}</div>;
}
