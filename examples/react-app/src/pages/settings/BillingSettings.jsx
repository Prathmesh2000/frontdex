import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

/** Plan and invoices. */
export default function BillingSettings() {
  const [invoices, setInvoices] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/billing/invoices', { signal: controller.signal }).then((r) => setInvoices(r.data));
    return () => controller.abort();
  }, []);
  return <ul>{invoices.map((i) => <li key={i.id}>{i.date} — {i.amount}</li>)}</ul>;
}
