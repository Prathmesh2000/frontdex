import { ProductEditor } from '@/features/admin/ProductEditor';

/** /admin/products/new or /admin/products/<id>/edit */
export default async function AdminProductPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const productId = slug[0] === 'new' ? undefined : slug[0];
  return <ProductEditor productId={productId} />;
}
