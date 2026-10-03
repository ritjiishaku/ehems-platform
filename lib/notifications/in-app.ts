/**
 * In-app notifications (CR-07, PRD §18.2 FR-055-060).
 *
 * ## Why this is separate from `service.ts`
 *
 * Email is a transport that can fail on someone else's outage. In-app is a write
 * to our own database — it either happens or it does not, and "delivery" means a
 * row exists. That difference drives two decisions here:
 *
 *  - **It is never gated on `sentAt`.** An in-app row is delivered the moment it
 *    is written, so `sentAt` is set immediately rather than after a handoff.
 *  - **It is the fallback channel.** `sendNotification` records a failure here
 *    only if the database write itself fails, which is a genuine incident rather
 *    than a provider outage.
 *
 * ## Content is rendered at read time, not at write time
 *
 * The row stores `template` + `payload`, exactly as it already does for email, and
 * the title and body are rendered by `renderInAppTemplate` when the member opens
 * the list. So a template fix reaches historic notifications instead of leaving
 * every past row frozen with whatever wording shipped that day. It also means no
 * rendered prose is duplicated into a long-lived table.
 *
 * The cost is that a member sees the *current* wording for an old event. That is
 * the right trade here: the payload is the record of what happened, and the
 * sentence around it is presentation.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import type { EventPayloadMap, NotificationEventType } from './types';

export const IN_APP_CHANNEL = 'in_app';

/** One-line titles, kept short because they render in a 375px list and a badge. */
const IN_APP_TITLES: Record<NotificationEventType, string> = {
  WELCOME_REGISTRATION: 'Welcome to EHEMS',
  PAYMENT_SUBMITTED: 'Payment received',
  PAYMENT_VERIFIED: 'Payment verified',
  PAYMENT_REJECTED: 'Payment needs attention',
  CERTIFICATE_ISSUED: 'Certificate issued',
  PASSWORD_RESET: 'Password reset',
  NDPA_CONSENT_WITHDRAWN: 'Consent withdrawn',
};

export type RenderedInApp = {
  title: string;
  body: string;
};

/**
 * Render an in-app message from the stored payload.
 *
 * Money is formatted by the caller where it has a formatter to hand; these bodies
 * deliberately avoid repeating figures the member can see on the payments page,
 * so a message never disagrees with the ledger.
 */
export function renderInAppTemplate<T extends NotificationEventType>(
  event: T,
  payload: EventPayloadMap[T],
): RenderedInApp {
  const title = IN_APP_TITLES[event];

  switch (event) {
    case 'WELCOME_REGISTRATION': {
      const p = payload as EventPayloadMap['WELCOME_REGISTRATION'];
      return {
        title,
        body: p.probationRoomUrl
          ? 'Your account is ready. Join the Probation Room to get started.'
          : 'Your account is ready.',
      };
    }

    case 'PAYMENT_SUBMITTED': {
      const p = payload as EventPayloadMap['PAYMENT_SUBMITTED'];
      return {
        title,
        body: `We have your payment for ${p.tierName}. An admin will verify it shortly.`,
      };
    }

    case 'PAYMENT_VERIFIED': {
      const p = payload as EventPayloadMap['PAYMENT_VERIFIED'];
      return {
        title,
        body: `Your ${p.tierName} payment is verified and your enrolment is active.`,
      };
    }

    case 'PAYMENT_REJECTED': {
      const p = payload as EventPayloadMap['PAYMENT_REJECTED'];
      // The reason is quoted back because it is the thing the member has to act
      // on (D-8). It is admin-authored text, rendered as plain text and never
      // interpreted as markup.
      return {
        title,
        body: `We could not verify your ${p.tierName} payment: ${p.rejectionReason}`,
      };
    }

    case 'CERTIFICATE_ISSUED': {
      const p = payload as EventPayloadMap['CERTIFICATE_ISSUED'];
      return { title, body: `Your ${p.tierName} certificate has been issued.` };
    }

    case 'PASSWORD_RESET':
      return { title, body: 'Use the link in your email to choose a new password.' };

    case 'NDPA_CONSENT_WITHDRAWN':
      // SEC-012: withdrawal must not delete the account, so the message says so
      // explicitly rather than leaving a member wondering whether they were
      // removed.
      return {
        title,
        body: 'Your consent withdrawal is recorded. Your account remains open.',
      };

    default: {
      // Exhaustiveness guard: adding an event to the union without a body here
      // becomes a compile error rather than an undefined notification.
      const never: never = event;
      return { title: String(never), body: '' };
    }
  }
}

/**
 * Persist one in-app notification.
 *
 * Never throws. `sendNotification` calls this in the middle of flows that have
 * already committed real state, so a write failure is logged and returned —
 * the same rule as email. `sentAt` is set now because delivery is the write.
 */
export async function persistInAppNotification<T extends NotificationEventType>(input: {
  event: T;
  payload: EventPayloadMap[T];
  userId: string | null | undefined;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!input.userId) {
    // A recipient we cannot address. The email path is still the member's real
    // route to this event; an orphaned row would be invisible to everyone.
    return { success: false, error: 'No user id on the recipient' };
  }

  try {
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        channel: IN_APP_CHANNEL,
        template: input.event,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        sentAt: new Date(),
      },
      select: { id: true },
    });
    return { success: true, id: row.id };
  } catch (err) {
    console.error(`[notifications] in-app ${input.event} could not be stored:`, err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown in-app error' };
  }
}

// ---------------------------------------------------------------------------
// Member reads
// ---------------------------------------------------------------------------

export type MemberNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
};

export type MemberNotificationRow = {
  id: string;
  template: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * Parse a stored payload back into the shape a renderer expects.
 *
 * The payload is free-form JSONB, so it cannot be trusted to still match the
 * template's type — a template can gain a field, or a row can predate a rename.
 * Anything unexpected renders as a generic line rather than throwing, because a
 * malformed historic row must not take down the whole notification list.
 */
function renderStored(row: MemberNotificationRow): RenderedInApp | null {
  if (!(row.template in IN_APP_TITLES)) return null;

  try {
    return renderInAppTemplate(
      row.template as NotificationEventType,
      row.payload as EventPayloadMap[NotificationEventType],
    );
  } catch {
    return { title: IN_APP_TITLES[row.template as NotificationEventType], body: '' };
  }
}

/**
 * A member's notifications, newest first. Scoped by `userId` in the query, never
 * by a filter applied afterwards.
 */
export async function listInAppNotifications(
  userId: string,
  limit = 50,
): Promise<MemberNotification[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, channel: IN_APP_CHANNEL },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const notifications: MemberNotification[] = [];
  for (const row of rows) {
    const rendered = renderStored({
      id: row.id,
      template: row.template,
      payload: row.payload,
      readAt: row.readAt,
      createdAt: row.createdAt,
    });
    if (!rendered) continue;
    notifications.push({
      id: row.id,
      title: rendered.title,
      body: rendered.body,
      read: row.readAt !== null,
      createdAt: row.createdAt,
    });
  }
  return notifications;
}

/** Unread in-app count for the dashboard badge. */
export async function countUnreadInApp(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, channel: IN_APP_CHANNEL, readAt: null },
  });
}

/**
 * Mark one notification read.
 *
 * Scoped by `userId` so a member cannot mark — or confirm the existence of —
 * someone else's row by guessing an id. Already-read is not an error: opening a
 * notification twice is a normal thing to do.
 */
export async function markInAppNotificationRead(
  notificationId: string,
  userId: string,
): Promise<{ ok: boolean; unread: number }> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, channel: IN_APP_CHANNEL, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true, unread: await countUnreadInApp(userId) };
}

export async function markAllInAppNotificationsRead(userId: string): Promise<{ unread: number }> {
  await prisma.notification.updateMany({
    where: { userId, channel: IN_APP_CHANNEL, readAt: null },
    data: { readAt: new Date() },
  });
  return { unread: 0 };
}
