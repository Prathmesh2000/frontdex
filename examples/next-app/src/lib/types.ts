export interface Product { id: string; name: string; price: number; image: string; category: string; stock: number; rating?: number }
export interface CartLine { product: Product; quantity: number }
export interface Address { name: string; street: string; city: string; zip: string; country: string }
export interface Order { id: string; status: 'pending' | 'paid' | 'shipped' | 'cancelled'; total: number; createdAt: string; lines: CartLine[] }
export interface User { id: string; name: string; email: string; role: 'customer' | 'admin' }
