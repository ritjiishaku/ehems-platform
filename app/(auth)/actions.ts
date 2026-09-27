'use server';

import { redirect } from 'next/navigation';
import { authenticateUser, registerUser, signIn } from '@/lib/auth';

export async function registerAction(formData: FormData) {
  const name = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  try {
    const user = await registerUser({ name, email, password });
    await signIn(user);
    redirect('/dashboard');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account';
    redirect(`/register?error=${encodeURIComponent(message)}`);
  }
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  try {
    const user = await authenticateUser({ email, password });
    await signIn(user);
    redirect('/dashboard');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to log in';
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}
