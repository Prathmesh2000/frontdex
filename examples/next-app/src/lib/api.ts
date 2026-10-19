import type { Order, Product } from './types';

export const fetcher = (url: string) => fetch(url).then((r) => r.json());
export const getProducts = (q: string) => fetcher(`/api/products?${q}`) as Promise<Product[]>;
export const getOrder = (id: string) => fetcher(`/api/orders/${id}`) as Promise<Order>;
export const saveOrder = (order: Partial<Order>) => fetch('/api/orders', { method: 'POST', body: JSON.stringify(order) });
export const trackEvent = (name: string, data?: unknown) => navigator.sendBeacon?.('/api/track', JSON.stringify({ name, data }));
