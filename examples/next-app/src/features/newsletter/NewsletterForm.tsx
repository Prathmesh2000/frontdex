import { subscribe } from './actions';

/** Server component form that posts straight to a server action. */
export function NewsletterForm() {
  return (
    <form action={subscribe} className="newsletter">
      <input name="email" type="email" required placeholder="you@example.com" />
      <button type="submit">Subscribe</button>
    </form>
  );
}
