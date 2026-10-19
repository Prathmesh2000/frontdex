'use client';
import { Badge } from '@/components/ui/Badge'; // demo: unused import for the catalogue
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
];

/** Account section tabs; highlights the active route. */
export function AccountNav() {
  const pathname = usePathname();
  return <nav className="account-nav flex gap-4">{LINKS.map((l) => <Link key={l.href} href={l.href} className={cn('tab', pathname === l.href && 'tab-active underline')}>{l.label}</Link>)}</nav>;
}
