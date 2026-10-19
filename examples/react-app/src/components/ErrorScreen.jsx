import { useRouteError, Link } from 'react-router-dom';

/** Router-level errorElement (404s, loader failures). */
export default function ErrorScreen() {
  const error = useRouteError();
  return (
    <div className="error-screen">
      <h1>{error?.status === 404 ? 'Page not found' : 'Unexpected error'}</h1>
      <Link to="/">Back to dashboard</Link>
    </div>
  );
}
