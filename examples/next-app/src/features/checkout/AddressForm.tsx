'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { Address } from '@/lib/types';
import { addressSchema } from './validation';
import styles from './Checkout.module.css';

interface AddressFormProps {
  initial: Partial<Address>;
  onSubmit: (address: Address) => void;
  submitLabel?: string;
}

/** Shipping address fields validated with the zod addressSchema. */
export function AddressForm({ initial, onSubmit, submitLabel = 'Continue' }: AddressFormProps) {
  const [values, setValues] = useState<Partial<Address>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (field: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [field]: e.target.value });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addressSchema.safeParse(values);
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrors({});
    onSubmit(result.data as Address);
  };

  return (
    <form onSubmit={handleSubmit} className={styles.step}>
      <Input label="Full name" required minLength={2} value={values.name ?? ''} error={errors.name} onChange={update('name')} />
      <Input label="Street" required value={values.street ?? ''} error={errors.street} onChange={update('street')} />
      <Input label="City" required value={values.city ?? ''} error={errors.city} onChange={update('city')} />
      <Input label="ZIP" required pattern="\d{5}" inputMode="numeric" value={values.zip ?? ''} error={errors.zip} onChange={update('zip')} />
      <Input label="Country" required value={values.country ?? 'US'} error={errors.country} onChange={update('country')} />
      <div className={styles.actions}><Button type="submit">{submitLabel}</Button></div>
    </form>
  );
}
