'use client';
import { createContext, useCallback, useContext, useReducer } from 'react';

export interface Toast { id: number; message: string; tone: 'info' | 'success' | 'error' }
type Action = { type: 'push'; toast: Toast } | { type: 'dismiss'; id: number };

function toastReducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'push':
      return [...state.slice(-4), action.toast];
    case 'dismiss':
      return state.filter((t) => t.id !== action.id);
  }
}

export const ToastContext = createContext<{ toasts: Toast[]; notify: (message: string, tone?: Toast['tone']) => void; dismiss: (id: number) => void } | null>(null);

/** Global notification queue (max 5 visible). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => dispatch({ type: 'push', toast: { id: Date.now(), message, tone } }), []);
  const dismiss = useCallback((id: number) => dispatch({ type: 'dismiss', id }), []);
  return <ToastContext.Provider value={{ toasts, notify, dismiss }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
