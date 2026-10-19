import React from 'react';
import { Button, Input } from '@/components/ui';
import { validateCard, validateExpiry } from './validation';
import styles from './Checkout.module.css';

interface PaymentFormProps {
  amount: number;
  onPaid: (token: string) => void;
  onBack: () => void;
}

interface PaymentFormState {
  card: string;
  expiry: string;
  error: string | null;
  sdkReady: boolean;
  secondsLeft: number;
}

/** Card entry. Class component because it wraps the imperative payments SDK. */
export class PaymentForm extends React.Component<PaymentFormProps, PaymentFormState> {
  state: PaymentFormState = { card: '', expiry: '', error: null, sdkReady: false, secondsLeft: 600 };
  private sessionTimer?: ReturnType<typeof setInterval>;

  componentDidMount() {
    const script = document.createElement('script');
    script.src = 'https://js.payments.example/v3';
    script.onload = () => this.setState({ sdkReady: true });
    document.body.appendChild(script);
    this.sessionTimer = setInterval(() => this.setState((s) => ({ secondsLeft: s.secondsLeft - 1 })), 1000);
  }

  componentDidUpdate(_: PaymentFormProps, prev: PaymentFormState) {
    if (prev.secondsLeft > 0 && this.state.secondsLeft === 0) this.setState({ error: 'Session expired, please re-enter your card' });
  }

  componentWillUnmount() {
    clearInterval(this.sessionTimer);
  }

  handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCard(this.state.card)) return this.setState({ error: 'Card number looks wrong' });
    if (!validateExpiry(this.state.expiry)) return this.setState({ error: 'Use MM/YY' });
    const res = await fetch('/api/payments/tokenize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card: this.state.card, expiry: this.state.expiry }) });
    const { token } = await res.json();
    this.props.onPaid(token);
  };

  render() {
    const { card, expiry, error, sdkReady } = this.state;
    return (
      <form onSubmit={this.handleSubmit} className={styles.step}>
        <Input label="Card number" required inputMode="numeric" autoComplete="cc-number" value={card} onChange={(e) => this.setState({ card: e.target.value })} />
        <Input label="Expiry (MM/YY)" required pattern="(0[1-9]|1[0-2])/\d{2}" value={expiry} onChange={(e) => this.setState({ expiry: e.target.value })} />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <Button variant="ghost" type="button" onClick={this.props.onBack}>Back</Button>
          <Button type="submit" disabled={!sdkReady}>Pay</Button>
        </div>
      </form>
    );
  }
}
