const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatPrice = (cents: number) => currency.format(cents / 100);
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });

/** @deprecated prices are stored in cents now; nothing imports this anymore. */
export function formatLegacyPrice(dollars: number) {
  return `$${dollars.toFixed(2)}`;
}
