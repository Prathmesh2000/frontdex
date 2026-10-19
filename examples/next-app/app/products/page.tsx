import { Filters } from '@/features/products/Filters';
import { ProductGrid } from '@/features/products/ProductGrid';

const CATEGORIES = ['kitchen', 'outdoor', 'office', 'kids'];

/** Catalogue listing with sidebar filters. Filters and grid are siblings. */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; sort?: 'price' | 'rating' | 'newest' }> }) {
  const { category, sort } = await searchParams;
  return (
    <div className="flex gap-8">
      <Filters categories={CATEGORIES} />
      <ProductGrid category={category} sort={sort} />
    </div>
  );
}
