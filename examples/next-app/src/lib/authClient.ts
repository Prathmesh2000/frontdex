import type { User } from './types';

type Listener = (user: User | null) => void;
const listeners = new Set<Listener>();

export const authClient = {
  async getSession(): Promise<User | null> {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    return res.ok ? res.json() : null;
  },
  async signIn(email: string, password: string) {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!res.ok) throw new Error('Invalid credentials');
    const user = (await res.json()) as User;
    listeners.forEach((l) => l(user));
    return user;
  },
  async signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    listeners.forEach((l) => l(null));
  },
  onAuthStateChanged(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
