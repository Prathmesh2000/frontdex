import Link from 'next/link';

/** Distraction-free checkout chrome. */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="checkout-shell max-w-5xl mx-auto">
      <Link href="/cart">← Back to cart</Link>
      {children}
      <p className="text-xs text-gray-500">Payments are encrypted end to end.</p>
    </div>
  );
}
