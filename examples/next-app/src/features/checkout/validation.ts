import { z } from 'zod';

export const addressSchema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  street: z.string().min(3, 'Street is required'),
  city: z.string().min(2, 'City is required'),
  zip: z.string().regex(/^\d{5}$/, 'ZIP must be 5 digits'),
  country: z.enum(['US', 'CA', 'MX']),
});

export type AddressInput = z.infer<typeof addressSchema>;

/** Luhn-free sanity check used before tokenising the card. */
export function validateCard(number: string) {
  const digits = number.replace(/\s+/g, '');
  return /^\d{13,19}$/.test(digits);
}

export const validateExpiry = (value: string) => /^(0[1-9]|1[0-2])\/\d{2}$/.test(value);
