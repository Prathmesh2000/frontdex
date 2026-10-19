import { memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { Badge, Card, Tooltip } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/lib/types';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: Product;
  /** Add-to-cart handler; hidden when omitted */
  onAdd?: (product: Product) => void;
  compact?: boolean;
  /** Shown as a ribbon, e.g. "New" */
  highlight?: string;
}

/** Product tile used in grids, search results and related products. */
export const ProductCard = memo(function ProductCard({ product, onAdd, compact = false, highlight }: ProductCardProps) {
  const soldOut = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock < 5;

  return (
    <Card elevated={!compact}>
      <article className={clsx(styles.card, { [styles.compact]: compact, [styles.soldOut]: soldOut })}>
        <Link href={`/products/${product.id}`}>
          <Image className={styles.image} src={product.image} alt={product.name} width={320} height={320} />
        </Link>
        {highlight && <Badge tone="success">{highlight}</Badge>}
        <h3>{product.name}</h3>
        <span className={styles.price}>{formatPrice(product.price)}</span>
        {lowStock && (
          <Tooltip text={`Only ${product.stock} left`}>
            <Badge tone="warning">Low stock</Badge>
          </Tooltip>
        )}
        {onAdd && !soldOut && <button className="btn btn-primary btn-sm" onClick={() => onAdd(product)}>Add to cart</button>}
      </article>
    </Card>
  );
});
