import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Shows a spinner and disables the button */
  loading?: boolean;
  icon?: React.ReactNode;
}

/** Design-system button. Use instead of raw <button> everywhere. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={`btn btn-${variant} btn-${size}`} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  );
});
