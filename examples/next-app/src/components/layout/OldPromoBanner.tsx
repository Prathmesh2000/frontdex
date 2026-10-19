import { useState } from 'react';

/**
 * Promo strip from the 2024 redesign.
 * @deprecated replaced by HeroBanner; no page renders this anymore.
 */
export default function OldPromoBanner({ message, dismissible = true }: { message: string; dismissible?: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="promo-strip">
      {message}
      {dismissible && <button onClick={() => setHidden(true)}>×</button>}
    </div>
  );
}
