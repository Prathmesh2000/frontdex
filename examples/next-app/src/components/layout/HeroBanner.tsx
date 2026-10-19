'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui';

interface HeroBannerProps {
  headline: string;
  /** ISO date the promotion ends */
  endsAt: string;
  ctaHref?: string;
}

/** Homepage hero with a live promo countdown. */
export function HeroBanner({ headline, endsAt, ctaHref = '/products' }: HeroBannerProps) {
  const [remaining, setRemaining] = useState(() => Date.parse(endsAt) - Date.now());

  useEffect(() => {
    // demo: intentional leak for the catalogue — the interval is never cleared on unmount.
    setInterval(() => setRemaining(Date.parse(endsAt) - Date.now()), 1000);
  }, [endsAt]);

  const hours = Math.max(0, Math.floor(remaining / 3_600_000));
  const minutes = Math.max(0, Math.floor((remaining % 3_600_000) / 60_000));

  return (
    <section className="hero grid md:grid-cols-2 gap-8">
      <div>
        <h1 className="text-4xl font-bold">{headline}</h1>
        <p className="countdown">Ends in {hours}h {minutes}m</p>
        <Button size="lg" onClick={() => window.location.assign(ctaHref)}>Shop the sale</Button>
      </div>
      <Image src="/hero.jpg" alt="" width={640} height={420} priority />
    </section>
  );
}
