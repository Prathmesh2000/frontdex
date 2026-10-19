'use client';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Button, Input } from '@/components/ui';
import { http } from '@/lib/http';
import { useAppSelector } from '@/store/hooks';
import { useToast } from '@/features/toast/ToastContext';

/** Edit name/email with native HTML validation. */
export function ProfileForm() {
  const profile = useSelector((state: { user: { profile: { name: string; email: string } | null } }) => state.user.profile);
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  // demo: dead state for the catalogue — the setter is never called.
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  const wishlistCount = useAppSelector((s) => s.user.wishlist.length);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await http.patch('/me', { name, email });
      notify('Profile saved', 'success');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Input label="Name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="hint">{lastSaved ? `Saved ${lastSaved}` : 'Not saved yet'}</p>
      <Button type="submit" loading={saving}>Save</Button>
    </form>
  );
}
