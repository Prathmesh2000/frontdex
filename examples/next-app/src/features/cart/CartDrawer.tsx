'use client';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleDrawer } from '@/store/uiSlice';
import { CartItem } from './CartItem';
import { OrderSummary } from './OrderSummary';

/** Slide-over cart opened from the header. Visibility lives in Redux (ui.drawerOpen). */
export function CartDrawer() {
  const open = useAppSelector((s) => s.ui.drawerOpen);
  const items = useAppSelector((s) => s.cart.items);
  const coupon = useAppSelector((s) => s.cart.coupon);
  const dispatch = useAppDispatch();
  const router = useRouter();

  const close = () => dispatch(toggleDrawer());
  const goToCheckout = () => {
    close();
    router.push('/checkout');
  };

  return (
    <Modal open={open} title={`Your cart (${items.length})`} onClose={close} footer={<Button onClick={goToCheckout} disabled={!items.length}>Checkout</Button>}>
      {items.length ? <ul>{items.map((line) => <CartItem key={line.product.id} line={line} />)}</ul> : <p className="empty">Your cart is empty.</p>}
      <OrderSummary lines={items} coupon={coupon} readOnly />
    </Modal>
  );
}
