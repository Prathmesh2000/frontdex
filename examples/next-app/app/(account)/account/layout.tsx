import { AccountNav } from '@/features/account/AccountNav';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

/** Signed-in area wrapper. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AccountNav />
      <section className="account-body">{children}</section>
    </ProtectedRoute>
  );
}
