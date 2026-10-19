import type { Address } from '@/lib/types';
import { AddressForm } from './AddressForm';

/** Wizard step 1. Passes the draft address down to AddressForm (prop drilling demo). */
export function AddressStep({ draft, onNext, onBack }: { draft: Partial<Address>; onNext: (a: Address) => void; onBack?: () => void }) {
  return (
    <section>
      <h2>Where should we ship?</h2>
      <AddressForm initial={draft} onSubmit={onNext} submitLabel="Continue to payment" />
    </section>
  );
}
