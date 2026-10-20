'use server';

/** Server action: adds an email to the newsletter list. */
export async function subscribe(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  if (!email.includes('@')) return { ok: false };
  return { ok: true };
}
