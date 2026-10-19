'use client';
import { CheckoutWizard } from '@/features/checkout/CheckoutWizard';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { useAuth } from '@/features/auth/AuthContext';

export default function CheckoutPage() {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      <CheckoutWizard userEmail={user?.email} />
    </ProtectedRoute>
  );
}
