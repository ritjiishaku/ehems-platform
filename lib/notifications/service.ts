import type {
  NotificationEventType,
  NotificationChannel,
  SendNotificationOptions,
  NotificationResult,
  ChannelDeliveryResult,
} from './types';
import { recipientSchema } from '../validation/notifications';
import { renderEmailTemplate } from './templates';
import { getEmailProvider } from './providers/email';
import { persistInAppNotification } from './in-app';

/**
 * Primary Notification Service (EHEMS Phase 4)
 *
 * All features (registration, payment state transitions, certificate issuance)
 * invoke this function instead of calling an email provider or vendor SDK directly.
 *
 * In Phase 1 the channels are email and in-app (CR-07, PRD §18.2). Email is
 * dispatched via EmailProvider; in-app writes a `Notification` row the member
 * reads in their dashboard. SMS/WhatsApp/Telegram hook into the channels loop in
 * Phase 2 without altering feature code.
 *
 * Delivery failures are logged and returned, never thrown. Callers are in the
 * middle of committing real state — a registered account, a verified payment — and
 * a mail provider being down is not a reason to tell a member their signup
 * failed. The trade is deliberate: a failure leaves no member-visible trace, so
 * the log line is the only record, which is why it carries the event id.
 *
 * Every attempt now persists a `Notification` row, which CR-07 flagged as
 * missing. Retention for that table is still open (CR-10), so the rows are
 * append-only history for now rather than a schedule the app enforces.
 */
export async function sendNotification<T extends NotificationEventType>(
  options: SendNotificationOptions<T>,
): Promise<NotificationResult> {
  const eventId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const channels: NotificationChannel[] =
    options.channels && options.channels.length > 0 ? options.channels : ['email', 'in_app'];

  // Validate recipient at boundary
  const recipientParsed = recipientSchema.safeParse(options.recipient);
  if (!recipientParsed.success) {
    const errorMessage = recipientParsed.error.issues.map((i) => i.message).join(', ');
    return {
      eventId,
      success: false,
      deliveries: [
        {
          channel: 'email',
          success: false,
          error: `Invalid recipient: ${errorMessage}`,
        },
      ],
    };
  }

  const recipient = recipientParsed.data;
  const deliveries: ChannelDeliveryResult[] = [];

  for (const channel of channels) {
    if (channel === 'email') {
      try {
        const rendered = renderEmailTemplate(options.event, options.payload);
        const emailProvider = getEmailProvider();
        const result = await emailProvider.sendEmail({
          to: recipient.email,
          recipientName: recipient.name,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        });

        if (!result.success) {
          // Same reasoning as the catch below: never block the caller, always
          // record why. `result.error` is provider wording and can name verified
          // domains, so it stays in the log.
          console.error(
            `[notifications] ${options.event} (${eventId}) not delivered via ` +
              `${emailProvider.name}:`,
            result.error,
          );
        }

        deliveries.push({
          channel: 'email',
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      } catch (err) {
        // Logged, not surfaced. A registration or a payment verification must not
        // fail because a mail provider is down — the member's account state is
        // already committed and correct. But a silent failure is how a rejected
        // payment goes unnoticed, so the cause has to reach the log with the
        // event id to correlate it.
        console.error(`[notifications] ${options.event} (${eventId}) failed to send:`, err);
        deliveries.push({
          channel: 'email',
          success: false,
          error: err instanceof Error ? err.message : 'Unknown email error',
        });
      }
    } else if (channel === 'in_app') {
      // Not a transport: this is a write to our own database, so it cannot fail
      // on a third party's outage. It is attempted for every event by default.
      const result = await persistInAppNotification({
        event: options.event,
        payload: options.payload,
        userId: recipient.userId,
      });
      deliveries.push({
        channel: 'in_app',
        success: result.success,
        messageId: result.id,
        error: result.error,
      });
    } else {
      // Phase 2 channel seams (SMS, WhatsApp, Telegram)
      deliveries.push({
        channel,
        success: false,
        error: `Channel "${channel}" is scheduled for Phase 2 implementation.`,
      });
    }
  }

  const overallSuccess = deliveries.some((d) => d.success);

  return {
    eventId,
    success: overallSuccess,
    deliveries,
  };
}
