'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { authClient } from '@/lib/authClient';
import type { User } from '@/lib/types';
import { useAppDispatch } from '@/store/hooks';
import { setProfile } from '@/store/userSlice';

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

/** Loads the session once and mirrors auth changes into Redux (user.profile). */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const dispatch = useAppDispatch();

  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then((session) => {
      if (cancelled) return;
      setUser(session);
      dispatch(setProfile(session));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    // demo: intentional leak for the catalogue — the unsubscribe function is never called.
    const unsub = authClient.onAuthStateChanged((next) => {
      setUser(next);
      dispatch(setProfile(next));
    });
  }, [dispatch]);

  const signIn = async (email: string, password: string) => {
    const next = await authClient.signIn(email, password);
    setUser(next);
  };
  const signOut = async () => {
    await authClient.signOut();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

/** Access the current session. Throws outside <AuthProvider>. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
