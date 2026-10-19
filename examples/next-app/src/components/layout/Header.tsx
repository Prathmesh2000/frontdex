'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { SearchBar } from '@/features/search/SearchBar';
import { CartDrawer } from '@/features/cart/CartDrawer';
import { useTheme } from '@/features/theme/ThemeContext';
import { useAppDispatch } from '@/store/hooks';
import { toggleDrawer } from '@/store/uiSlice';
import { cn } from '@/lib/cn';
import CartBadge from './CartBadge';

const NAV = [
  { href: '/products', label: 'Shop' },
  { href: '/blog', label: 'Journal' },
  { href: '/search', label: 'Search' },
];

/** Sticky top navigation: search, account, theme toggle and the cart drawer trigger. */
export function Header() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const dispatch = useAppDispatch();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onToggleCart = () => dispatch(toggleDrawer());

  return (
    <header className={cn('site-header sticky top-0', { 'shadow-md': scrolled, compact: scrolled })}>
      <Link href="/" className="logo">Northwind</Link>
      <nav>{NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      <SearchBar placeholder="Search products" />
      <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? '☀' : '☾'}</Button>
      {user ? <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button> : <Link href="/account">Sign in</Link>}
      <Button variant="secondary" size="sm" onClick={onToggleCart} icon={<CartBadge />}>Cart</Button>
      <CartDrawer />
    </header>
  );
}
