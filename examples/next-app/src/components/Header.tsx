'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import CartBadge from './CartBadge';

/**
 * Top navigation bar. Becomes compact after scrolling.
 */
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav ref={navRef} className={scrolled ? 'compact' : ''}>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <button onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
      <CartBadge max={99} />
    </nav>
  );
}
