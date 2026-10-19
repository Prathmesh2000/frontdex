import { HeroBanner } from '@/components/layout/HeroBanner';
import { FeaturedCollections } from '@/features/products/FeaturedCollections';
import { NewsletterForm } from '@/features/newsletter/NewsletterForm';

export const metadata = { title: 'Northwind Shop · Home' };

/** Landing page: promo hero + tabbed collections. */
export default function HomePage() {
  return (
    <>
      <HeroBanner headline="Autumn sale — up to 40% off" endsAt="2026-11-01T00:00:00Z" />
      <FeaturedCollections defaultTab="bestsellers" />
      <NewsletterForm />
    </>
  );
}
