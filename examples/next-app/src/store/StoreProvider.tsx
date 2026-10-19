'use client';
import { useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, type AppStore } from './index';

/** Creates the Redux store once per request/tab and provides it to client components. */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();
  return <Provider store={storeRef.current}>{children}</Provider>;
}
