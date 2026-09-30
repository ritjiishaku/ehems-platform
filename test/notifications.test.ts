import { describe, expect, it, beforeEach } from 'vitest';
import {
  sendNotification,
  ConsoleEmailProvider,
  MockFailEmailProvider,
  setEmailProvider,
} from '@/lib/notifications';

describe('Notification Service (Phase 4 Abstraction)', () => {
  let consoleProvider: ConsoleEmailProvider;

  beforeEach(() => {
    consoleProvider = new ConsoleEmailProvider();
    setEmailProvider(consoleProvider);
  });

  it('sends WELCOME_REGISTRATION email successfully', async () => {
    const res = await sendNotification({
      event: 'WELCOME_REGISTRATION',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: { name: 'Dr. Aisha Bello' },
    });

    expect(res.success).toBe(true);
    expect(res.deliveries).toHaveLength(1);
    expect(res.deliveries[0].channel).toBe('email');
    expect(res.deliveries[0].success).toBe(true);

    expect(consoleProvider.sentEmails).toHaveLength(1);
    expect(consoleProvider.sentEmails[0].to).toBe('member@example.com');
    expect(consoleProvider.sentEmails[0].subject).toContain('Welcome to EHEMS');
  });

  it('sends PAYMENT_SUBMITTED notification with formatted Naira kobo', async () => {
    const res = await sendNotification({
      event: 'PAYMENT_SUBMITTED',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: {
        name: 'Dr. Aisha Bello',
        tierName: 'Basic Level',
        amountKobo: 30000000,
        paymentId: 'pay_123',
      },
    });

    expect(res.success).toBe(true);
    expect(consoleProvider.sentEmails[0].subject).toContain('Basic Level');
    expect(consoleProvider.sentEmails[0].text).toContain('₦300,000.00');
  });

  it('sends PAYMENT_VERIFIED notification', async () => {
    const res = await sendNotification({
      event: 'PAYMENT_VERIFIED',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: {
        name: 'Dr. Aisha Bello',
        tierName: 'Advanced Level IV',
        enrolmentId: 'enr_456',
      },
    });

    expect(res.success).toBe(true);
    expect(consoleProvider.sentEmails[0].subject).toContain('Payment Verified');
    expect(consoleProvider.sentEmails[0].html).toContain('Advanced Level IV');
  });

  it('sends PAYMENT_REJECTED notification with rejection reason', async () => {
    const res = await sendNotification({
      event: 'PAYMENT_REJECTED',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: {
        name: 'Dr. Aisha Bello',
        tierName: 'Basic Level III',
        rejectionReason: 'Bank reference number does not match receipt attachment',
      },
    });

    expect(res.success).toBe(true);
    expect(consoleProvider.sentEmails[0].text).toContain(
      'Bank reference number does not match receipt attachment',
    );
  });

  it('sends CERTIFICATE_ISSUED notification with verification link', async () => {
    const res = await sendNotification({
      event: 'CERTIFICATE_ISSUED',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: {
        name: 'Dr. Aisha Bello',
        tierName: 'Advanced Level IV',
        certificateId: 'cert_789',
        verificationUrl: 'https://ehems.ng/verify/cert_789',
      },
    });

    expect(res.success).toBe(true);
    expect(consoleProvider.sentEmails[0].html).toContain('cert_789');
    expect(consoleProvider.sentEmails[0].html).toContain('https://ehems.ng/verify/cert_789');
  });

  it('sends a password reset link as a transactional email', async () => {
    const resetUrl = 'https://ehems.example/reset-password?token=opaque-token';
    const res = await sendNotification({
      event: 'PASSWORD_RESET',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: { name: 'Dr. Aisha Bello', resetUrl },
    });

    expect(res.success).toBe(true);
    expect(consoleProvider.sentEmails[0].subject).toBe('Reset your EHEMS password');
    expect(consoleProvider.sentEmails[0].text).toContain(resetUrl);
    expect(consoleProvider.sentEmails[0].text).toContain('expires in one hour');
  });

  it('fails gracefully when given an invalid email address', async () => {
    const res = await sendNotification({
      event: 'WELCOME_REGISTRATION',
      recipient: { email: 'invalid-email', name: 'Test' },
      payload: { name: 'Test' },
    });

    expect(res.success).toBe(false);
    expect(res.deliveries[0].error).toContain('Invalid recipient email address');
  });

  it('handles provider delivery errors gracefully without throwing', async () => {
    setEmailProvider(new MockFailEmailProvider());

    const res = await sendNotification({
      event: 'WELCOME_REGISTRATION',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: { name: 'Dr. Aisha Bello' },
    });

    expect(res.success).toBe(false);
    expect(res.deliveries[0].error).toContain('Simulated email provider network timeout');
  });

  it('reports Phase 2 channels as unfulfilled seams without crashing email', async () => {
    const res = await sendNotification({
      event: 'WELCOME_REGISTRATION',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: { name: 'Dr. Aisha Bello' },
      channels: ['email', 'whatsapp'],
    });

    expect(res.success).toBe(true);
    expect(res.deliveries).toHaveLength(2);
    expect(res.deliveries.find((d) => d.channel === 'email')?.success).toBe(true);
    expect(res.deliveries.find((d) => d.channel === 'whatsapp')?.success).toBe(false);
    expect(res.deliveries.find((d) => d.channel === 'whatsapp')?.error).toContain('Phase 2');
  });
});
