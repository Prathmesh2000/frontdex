import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Validation message shown under the field */
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, ...rest }, ref) {
  const id = useId();
  return (
    <label htmlFor={id} className="field">
      <span>{label}</span>
      <input id={id} ref={ref} aria-invalid={!!error} {...rest} />
      {error ? <small className="error">{error}</small> : hint && <small>{hint}</small>}
    </label>
  );
});
