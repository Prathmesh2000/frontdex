import { AdminSidebar } from '@/features/admin/AdminSidebar';
import { ErrorBoundary } from '@/features/admin/ErrorBoundary';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

/** Admin shell: role-gated, with sidebar and an error boundary around content. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute role="admin">
      <div className="flex">
        <AdminSidebar />
        <ErrorBoundary fallbackTitle="The admin panel crashed">{children}</ErrorBoundary>
      </div>
    </ProtectedRoute>
  );
}
