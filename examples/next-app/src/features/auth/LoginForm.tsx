'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { useAuth } from './AuthContext';

interface LoginValues {
  email: string;
  password: string;
  remember: boolean;
}

/** Email + password sign-in, validated with react-hook-form. */
export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ defaultValues: { remember: true } });

  const onSubmit = async (values: LoginValues) => {
    try {
      setServerError(null);
      await signIn(values.email, values.password);
      onSuccess?.();
    } catch (err) {
      setServerError((err as Error).message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Input label="Email" type="email" error={errors.email?.message} {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })} />
      <Input label="Password" type="password" error={errors.password?.message} {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'At least 8 characters' } })} />
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" {...register('remember')} /> Remember me
      </label>
      {serverError && <p className="error">{serverError}</p>}
      <Button type="submit" loading={isSubmitting}>Sign in</Button>
    </form>
  );
}
