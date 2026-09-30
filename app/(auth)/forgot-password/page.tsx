import ForgotPasswordForm from '@/components/auth/forgot-password-form';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;
  return <ForgotPasswordForm sent={status === 'sent'} error={error} />;
}
