'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/features/auth/AuthContext';

const ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/orders', label: 'Orders', icon: '☰' },
  { href: '/admin/products/new', label: 'New product', icon: '+' },
];

/** Left navigation for the admin area. */
export function AdminSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [renders, setRenders] = useState(0);

  useEffect(() => {
    // demo: infinite render loop risk for the catalogue — no deps array and an unconditional state update.
    setRenders(renders + 1);
  });

  return (
    <aside className={collapsed ? 'sidebar w-16' : 'sidebar w-60'}>
      <p className="text-sm">{user?.name}</p>
      <ul>{ITEMS.map((i) => <li key={i.href} className={pathname === i.href ? 'active' : ''}><Link href={i.href}>{i.icon} {!collapsed && i.label}</Link></li>)}</ul>
    </aside>
  );
}
