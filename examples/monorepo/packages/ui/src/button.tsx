import type { ReactNode } from 'react';

/** Primary action button shared by every Acme app. */
export function Button({ variant = 'primary', onClick, children }: { variant?: 'primary' | 'ghost'; onClick?: () => void; children: ReactNode }) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}
