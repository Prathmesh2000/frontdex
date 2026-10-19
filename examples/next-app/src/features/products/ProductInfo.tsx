import { Badge } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/lib/types';
import { AddToCartButton } from './AddToCartButton';

/** Title, price, stock and the add-to-cart controls. */
export function ProductInfo({ product, showSku = false }: { product: Product; showSku?: boolean }) {
  const inStock = product.stock > 0;
  return (
    <div className="product-info">
      <h1>{product.name}</h1>
      <p className="price">{formatPrice(product.price)}</p>
      <Badge tone={inStock ? 'success' : 'danger'}>{inStock ? 'In stock' : 'Sold out'}</Badge>
      <AddToCartButton product={product} maxQuantity={Math.min(product.stock, 10)} />
    </div>
  );
}
