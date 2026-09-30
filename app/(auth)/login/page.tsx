import LoginForm from '@/components/auth/login-form';

/** Login route. Thin wrapper — see the note in ../register/page.tsx. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;
  return <LoginForm error={error} status={status} />;
}
