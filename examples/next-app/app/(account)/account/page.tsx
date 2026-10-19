'use client';
import { useSearchParams } from 'next/navigation';
import { LoginForm } from '@/features/auth/LoginForm';
import { ProfileForm } from '@/features/account/ProfileForm';
import { useAuth } from '@/features/auth/AuthContext';

export default function AccountPage() {
  const { user } = useAuth();
  const wantsLogin = useSearchParams().has('login');
  return user && !wantsLogin ? <ProfileForm /> : <LoginForm onSuccess={() => window.location.assign('/account')} />;
}
