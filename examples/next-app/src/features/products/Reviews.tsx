'use client';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui';

interface Review { id: string; author: string; rating: number; body: string }

/** Customer reviews, loaded lazily below the fold. */
export default function Reviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // demo: intentional race for the catalogue — no abort/ignore flag, a slow response can overwrite a newer product's reviews.
    fetch(`/api/products/${productId}/reviews`)
      .then((r) => r.json())
      .then((data) => setReviews(data));
  }, [productId]);

  if (!reviews) return <Spinner label="Loading reviews" />;
  const visible = expanded ? reviews : reviews.slice(0, 3);
  return (
    <section className="reviews">
      {visible.map((r) => <blockquote key={r.id}>{'★'.repeat(r.rating)} {r.body} — {r.author}</blockquote>)}
      {reviews.length > 3 && <button onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `Show all ${reviews.length}`}</button>}
    </section>
  );
}
