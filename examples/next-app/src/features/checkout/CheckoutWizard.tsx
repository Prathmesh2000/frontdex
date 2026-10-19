'use client';
import { useCallback, useEffect, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import type { Address } from '@/lib/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { checkout } from '@/store/cartSlice';
import { OrderSummary } from '@/features/cart/OrderSummary';
import { CartItem } from '@/features/cart/CartItem';
import { useToast } from '@/features/toast/ToastContext';
import { AddressStep } from './AddressStep';
import { PaymentForm } from './PaymentForm';
import { StepIndicator } from './StepIndicator';
import styles from './Checkout.module.css';

interface WizardState {
  step: 0 | 1 | 2;
  address: Partial<Address>;
  paymentToken: string | null;
  completed: number[];
}

type WizardAction =
  | { type: 'address'; address: Address }
  | { type: 'paid'; token: string }
  | { type: 'back' }
  | { type: 'restore'; state: WizardState };

const DRAFT_KEY = 'checkout-draft';

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'address':
      return { ...state, address: action.address, step: 1, completed: [...state.completed, 0] };
    case 'paid':
      return { ...state, paymentToken: action.token, step: 2, completed: [...state.completed, 1] };
    case 'back':
      return { ...state, step: Math.max(0, state.step - 1) as WizardState['step'] };
    case 'restore':
      return action.state;
  }
}

/** Three-step checkout state machine: address → payment → review. Persists a draft in sessionStorage. */
export function CheckoutWizard({ userEmail }: { userEmail?: string }) {
  const [state, dispatchWizard] = useReducer(wizardReducer, { step: 0, address: {}, paymentToken: null, completed: [] });
  const items = useAppSelector((s) => s.cart.items);
  const coupon = useAppSelector((s) => s.cart.coupon);
  const status = useAppSelector((s) => s.cart.status);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { notify } = useToast();
  const amount = items.reduce((sum, l) => sum + l.product.price * l.quantity, 0);

  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) dispatchWizard({ type: 'restore', state: JSON.parse(saved) });
  }, []);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  }, [state]);

  const handlePlaceOrder = useCallback(async () => {
    const result = await dispatch(checkout());
    if (checkout.fulfilled.match(result)) {
      sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/checkout/success?order=${result.payload.id}`);
    } else notify('Payment failed, please try again', 'error');
  }, [dispatch, router, notify]);

  return (
    <div className={styles.wizard}>
      <div>
        <StepIndicator current={state.step} completed={state.completed} />
        {state.step === 0 && <AddressStep draft={state.address} onNext={(address) => dispatchWizard({ type: 'address', address })} />}
        {state.step === 1 && <PaymentForm amount={amount} onPaid={(token) => dispatchWizard({ type: 'paid', token })} onBack={() => dispatchWizard({ type: 'back' })} />}
        {state.step === 2 && (
          <section className={styles.step}>
            <h2>Review</h2>
            <ul>{items.map((l) => <CartItem key={l.product.id} line={l} readOnly />)}</ul>
            <Button onClick={handlePlaceOrder} loading={status === 'submitting'}>Place order</Button>
          </section>
        )}
      </div>
      <OrderSummary lines={items} coupon={coupon} readOnly={state.step === 2} />
    </div>
  );
}
