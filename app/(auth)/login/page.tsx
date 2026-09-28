import LoginForm from '@/components/auth/login-form';

/** Login route. Thin wrapper — see the note in ../register/page.tsx. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm error={error} />;
}
