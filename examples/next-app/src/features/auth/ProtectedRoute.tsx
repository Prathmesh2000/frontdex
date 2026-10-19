'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';
import { useAuth } from './AuthContext';

/** Redirects to the login page when there is no session; optionally requires a role. */
export function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'customer' }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = !!user && (!role || user.role === role);

  useEffect(() => {
    if (!loading && !allowed) router.replace(`/account?login=1&next=${encodeURIComponent(pathname)}`);
  }, [loading, allowed, router, pathname]);

  if (loading || !allowed) return <Spinner label="Checking session" />;
  return <>{children}</>;
}
