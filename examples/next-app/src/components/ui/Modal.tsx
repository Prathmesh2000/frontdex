'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra buttons rendered next to "Close" */
  footer?: React.ReactNode;
}

/** Accessible dialog rendered into document.body. Locks page scroll and closes on Escape. */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    previousFocus.current = document.activeElement as HTMLElement;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.removeProperty('overflow');
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <footer>
          {footer}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
