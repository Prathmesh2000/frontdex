'use client';
import { createContext, useReducer } from 'react';

export const CartContext = createContext({ items: [] as string[], add: (id: string) => {} });

function reducer(state: string[], action: { type: 'add'; id: string }) {
  return [...state, action.id];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(reducer, []);
  return <CartContext.Provider value={{ items, add: (id) => dispatch({ type: 'add', id }) }}>{children}</CartContext.Provider>;
}
