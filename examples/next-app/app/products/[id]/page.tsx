import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { ProductGallery } from '@/features/products/ProductGallery';
import { ProductInfo } from '@/features/products/ProductInfo';
import { RelatedProducts } from '@/features/products/RelatedProducts';
import type { Product } from '@/lib/types';

const Reviews = dynamic(() => import('@/features/products/Reviews'), { loading: () => <p>Loading reviews…</p> });

async function loadProduct(id: string): Promise<Product | null> {
  const res = await fetch(`${process.env.API_URL}/products/${id}`, { next: { revalidate: 60 } });
  return res.ok ? res.json() : null;
}

/** Product detail: gallery, info, lazy reviews and related items. */
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) notFound();
  return (
    <article className="grid md:grid-cols-2 gap-10">
      <ProductGallery images={[product.image]} alt={product.name} />
      <ProductInfo product={product} />
      <Reviews productId={product.id} />
      <RelatedProducts category={product.category} excludeId={product.id} />
    </article>
  );
}
