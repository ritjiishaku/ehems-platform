import RegisterForm from '@/components/auth/register-form';

/**
 * Registration route. A thin wrapper: Next 15+ hands `searchParams` over as a
 * Promise, so the page has to be `async` to read it. Testing for
 * `'then' in searchParams` instead silently discards every error message,
 * because a real request always arrives as a promise.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <RegisterForm error={error} />;
}
