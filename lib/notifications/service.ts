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

/**
 * Primary Notification Service (EHEMS Phase 4)
 *
 * All features (registration, payment state transitions, certificate issuance)
 * invoke this function instead of calling an email provider or vendor SDK directly.
 *
 * In Phase 1, email is dispatched via EmailProvider. In Phase 2, additional channels
 * (SMS, WhatsApp, Telegram) hook into the channels loop without altering feature code.
 */
export async function sendNotification<T extends NotificationEventType>(
  options: SendNotificationOptions<T>,
): Promise<NotificationResult> {
  const eventId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const channels: NotificationChannel[] =
    options.channels && options.channels.length > 0 ? options.channels : ['email'];

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

        deliveries.push({
          channel: 'email',
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        });
      } catch (err) {
        deliveries.push({
          channel: 'email',
          success: false,
          error: err instanceof Error ? err.message : 'Unknown email error',
        });
      }
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
