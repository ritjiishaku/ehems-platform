import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConsoleEmailProvider,
  ResendEmailProvider,
  getEmailProvider,
  isTransactionalEmailConfigured,
  resetEmailProvider,
  sendNotification,
  setEmailProvider,
} from '@/lib/notifications';
import type { SendEmailOptions } from '@/lib/notifications';

/**
 * Provider selection and the Resend adapter, without a network call.
 *
 * `resend` is mocked rather than allowed to reach the network: these tests assert
 * our own translation of the SDK's response shape, and a live call would make the
 * suite depend on an account, a verified domain, and a third party's uptime.
 */

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const validEmail: SendEmailOptions = {
  to: 'member@example.com',
  recipientName: 'Dr. Aisha Bello',
  subject: 'Welcome to EHEMS',
  html: '<p>Hello</p>',
  text: 'Hello',
};

const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.EMAIL_FROM;
const originalName = process.env.EMAIL_FROM_NAME;

beforeEach(() => {
  sendMock.mockReset();
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'no-reply@ehems.ng';
  process.env.EMAIL_FROM_NAME = 'EHEMS';
  resetEmailProvider();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = originalFrom;
  if (originalName === undefined) delete process.env.EMAIL_FROM_NAME;
  else process.env.EMAIL_FROM_NAME = originalName;
  resetEmailProvider();
});

describe('provider selection', () => {
  it('uses Resend when the API key and sender are configured', () => {
    expect(isTransactionalEmailConfigured()).toBe(true);
    expect(getEmailProvider().name).toBe('resend');
  });

  it('falls back to the console provider when the key is absent', () => {
    delete process.env.RESEND_API_KEY;
    resetEmailProvider();

    expect(isTransactionalEmailConfigured()).toBe(false);
    expect(getEmailProvider().name).toBe('console');
  });

  it('falls back when the key is present but the sender is not', () => {
    // The half-configured case: Resend rejects an unverified or missing sender
    // at send time, so it must not be selected on the strength of the key alone.
    delete process.env.EMAIL_FROM;
    resetEmailProvider();

    expect(getEmailProvider().name).toBe('console');
  });

  it('memoises the selection until it is explicitly reset', () => {
    const first = getEmailProvider();
    expect(getEmailProvider()).toBe(first);

    process.env.RESEND_API_KEY = 're_changed';
    expect(getEmailProvider()).toBe(first);
  });

  it('lets a test override the provider outright', () => {
    const stub = new ConsoleEmailProvider();
    setEmailProvider(stub);

    expect(getEmailProvider()).toBe(stub);
  });
});

describe('ResendEmailProvider', () => {
  it('reports a provider id on success', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_123' }, error: null });

    const result = await new ResendEmailProvider().sendEmail(validEmail);

    expect(result).toEqual({ success: true, messageId: 'msg_123' });
  });

  it('sends the configured sender, recipient, and both bodies', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await new ResendEmailProvider().sendEmail(validEmail);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      from: 'EHEMS <no-reply@ehems.ng>',
      to: 'member@example.com',
      subject: 'Welcome to EHEMS',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it('uses the bare address when no display name is configured', async () => {
    delete process.env.EMAIL_FROM_NAME;
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await new ResendEmailProvider().sendEmail(validEmail);

    expect(sendMock.mock.calls[0]?.[0].from).toBe('no-reply@ehems.ng');
  });

  it('does not double-wrap an address that already carries a display name', async () => {
    // A natural operator mistake: pasting "EHEMS <addr>" into EMAIL_FROM while
    // EMAIL_FROM_NAME is also set produced "EHEMS <EHEMS <addr>>", which some
    // MTAs reject outright.
    process.env.EMAIL_FROM = 'EHEMS <no-reply@ehems.ng>';
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await new ResendEmailProvider().sendEmail(validEmail);

    expect(sendMock.mock.calls[0]?.[0].from).toBe('EHEMS <no-reply@ehems.ng>');
  });

  it('fails without sending when unconfigured, and names both variables', async () => {
    // The case that matters at launch: a deploy missing its key must say so,
    // rather than reporting a send it never attempted.
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const result = await new ResendEmailProvider().sendEmail(validEmail);

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY');
    expect(result.error).toContain('EMAIL_FROM');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns the rejection reason rather than throwing', async () => {
    sendMock.mockResolvedValue({ error: { message: 'Domain is not verified' }, data: null });

    const result = await new ResendEmailProvider().sendEmail(validEmail);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Domain is not verified');
  });

  it('treats an accepted message with no id as a failure', async () => {
    sendMock.mockResolvedValue({ data: null, error: null });

    const result = await new ResendEmailProvider().sendEmail(validEmail);

    // A 2xx we cannot confirm must not read as delivered; the password-reset
    // link depends on that distinction.
    expect(result.success).toBe(false);
    expect(result.error).toContain('no id');
  });

  it('truncates an over-long subject to the provider limit', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await new ResendEmailProvider().sendEmail({
      ...validEmail,
      subject: 'x'.repeat(1200),
    });

    expect((sendMock.mock.calls[0]?.[0].subject as string).length).toBe(998);
  });
});

describe('delivery failures never reach the member', () => {
  it('logs the cause but still resolves, so the caller is not blocked', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockResolvedValue({ error: { message: 'rate limited' }, data: null });

    const result = await sendNotification({
      event: 'WELCOME_REGISTRATION',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: { name: 'Dr. Aisha Bello' },
    });

    // The caller's transaction is already committed and correct; a mail outage
    // must not report a failed registration.
    expect(result.success).toBe(false);
    expect(result.deliveries[0].error).toContain('rate limited');
    expect(logged).toHaveBeenCalled();
    // Correlatable with the delivery record that was returned.
    expect(logged.mock.calls[0]?.[0]).toContain(result.eventId);
    logged.mockRestore();
  });

  it('recovers from a provider that throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValue(new Error('socket hang up'));

    const result = await sendNotification({
      event: 'PASSWORD_RESET',
      recipient: { email: 'member@example.com', name: 'Dr. Aisha Bello' },
      payload: { name: 'Dr. Aisha Bello', resetUrl: 'https://ehems.ng/reset?token=abc' },
    });

    expect(result.success).toBe(false);
    expect(result.deliveries[0].error).toContain('socket hang up');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
