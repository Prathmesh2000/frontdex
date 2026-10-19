/** Inline loading indicator. */
export function Spinner({ size = 16, label = 'Loading' }: { size?: number; label?: string }) {
  return <span role="status" aria-label={label} className="spinner" style={{ width: size, height: size }} />;
}
