'use client';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { CartItem } from '@/features/cart/CartItem';
import { OrderSummary } from '@/features/cart/OrderSummary';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { clearCart } from '@/store/cartSlice';

/** Full cart page. Reads lines and coupon from Redux and passes them down as props. */
export default function CartPage() {
  const items = useAppSelector((s) => s.cart.items);
  const coupon = useAppSelector((s) => s.cart.coupon);
  const dispatch = useAppDispatch();

  if (!items.length) return <p>Your cart is empty. <Link href="/products">Keep shopping</Link></p>;
  return (
    <div className="grid md:grid-cols-3 gap-8">
      <ul className="md:col-span-2">{items.map((line) => <CartItem key={line.product.id} line={line} />)}</ul>
      <div>
        <OrderSummary lines={items} coupon={coupon} />
        <Button variant="ghost" onClick={() => dispatch(clearCart())}>Clear cart</Button>
        <Link href="/checkout" className="btn btn-primary btn-lg">Checkout</Link>
      </div>
    </div>
  );
}
