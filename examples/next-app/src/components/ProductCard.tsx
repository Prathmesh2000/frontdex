import { memo, useContext, useState } from 'react';
import Image from 'next/image';
import { CartContext } from '@/context/CartContext';

export interface Product { id: string; name: string; price: number; image?: string }

interface BaseProps { className?: string }

interface ProductCardProps extends BaseProps {
  /** Product to render */
  product: Product;
  /** Called when the user adds the product to the cart */
  onAdd?: (id: string) => void;
  compact?: boolean;
}

/** Card shown in product grids. */
export const ProductCard = memo(function ProductCard({ product, onAdd, compact = false }: ProductCardProps) {
  const [hovered, setHovered] = useState(false);
  const cart = useContext(CartContext);
  return (
    <article onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {product.image && <Image src={product.image} alt={product.name} width={200} height={200} />}
      <h3>{product.name}</h3>
      {!compact && <button onClick={() => (onAdd ?? cart.add)(product.id)}>Add</button>}
    </article>
  );
});
