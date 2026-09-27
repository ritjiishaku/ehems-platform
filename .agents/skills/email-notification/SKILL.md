---
name: email-notification
description: Send a notification to a member on EHEMS. Use when a feature needs to notify a user — registration, payment submitted, payment verified, payment rejected, tier activated, certificate issued, or any admin announcement. Also use when adding a new notification type or a new channel.
---

# Email Notification

Phase 1 sends email and in-app notifications. Phase 2 is expected to add SMS,
WhatsApp, and Telegram. **The abstraction that makes that cheap is built in
Phase 1.** If you call a mail provider SDK directly from a feature, you have
just created work for later and a place for bugs to hide.

The Phase 2 channel attribution is inference, not a cited requirement —
FR-060 is classified `Should / PROPOSED` and carries no phase. The Phase 1
obligation is the abstraction itself.

## The rule

**Features never send notifications directly.** They call a named method
on the notification service. The service decides the channels, renders
the templates, and dispatches.

```ts
// In a feature — correct
await notify.paymentVerified(payment.userId, payment.id);

// In a feature — wrong, never do this
await sendEmail(user.email, "Payment verified", "...");
```

## The service shape

```ts
// lib/notifications/index.ts

export const notify = {
  // FR-055 — registration confirmation
  registrationWelcome: (userId: string) =>
    dispatch("registration_welcome", userId),

  // FR-056 — payment submission confirmation
  paymentSubmitted: (userId: string, paymentId: string) =>
    dispatch("payment_submitted", userId, { paymentId }),

  // FR-057 — payment verified
  paymentVerified: (userId: string, paymentId: string) =>
    dispatch("payment_verified", userId, { paymentId }),

  // FR-058 — tier activation
  tierActivated: (userId: string, enrolmentId: string) =>
    dispatch("tier_activated", userId, { enrolmentId }),

  // FR-059 — certificate issuance
  certificateIssued: (userId: string, certificateIds: string[]) =>
    dispatch("certificate_issued", userId, { certificateIds }),

  // Not in the PRD's numbering, but the payment flow needs it
  paymentRejected: (userId: string, paymentId: string, reason: string) =>
    dispatch("payment_rejected", userId, { paymentId, reason }),
};
```

Each named method is a **notification type**, not a channel. The type
resolves to one or more channels per the notification matrix below.

## The dispatch pipeline

```
notify.someEvent(userId, ...args)
  → load user (email, phone, preferences)
  → resolve channels for this type
  → for each channel:
      → render template with args
      → enqueue for delivery
  → write a Notification row (for in-app + audit trail)
```

**Dispatch is asynchronous.** The feature that triggers a notification
does not wait for delivery. Email providers are slow and occasionally
down; a slow SMTP call must never block a payment verification.

In Phase 1 there is no job queue, so "asynchronous" has to mean the request
returns without waiting on the provider — the delivery attempt is fire-and-
forget off the response path, not awaited inline. See the dispatch
implementation below for how that is achieved without a queue. Adding a real
queue later is a change to `dispatch()` alone.

## The critical ordering rule

**Notify after commit, never inside the transaction.**

```ts
// Correct
await prisma.$transaction(async (tx) => {
  await tx.payment.update({
    /* ... */
  });
  await activateEnrolment(tx, paymentId);
  await audit(tx, {
    /* ... */
  });
});

// Both notifications fire after the commit, and neither blocks the response.
void notifyAfterCommit([
  () => notify.paymentVerified(payment.userId, payment.id),
  () => notify.tierActivated(payment.userId, enrolment.id),
]);

// Wrong — do not do this
await prisma.$transaction(async (tx) => {
  await tx.payment.update({
    /* ... */
  });
  await notify.paymentVerified(payment.userId, payment.id); // ← inside
});
```

`payment_verified` and `tier_activated` are **separate notification types
that fire together** on verification — the member gets both. A verification
example that only sends `paymentVerified` ships half the required
notifications.

Two reasons:

1. **External I/O inside a transaction holds the DB lock.** A slow mail
   provider turns a 50ms transaction into a 5-second one under load.
2. **A failed send rolls back the business change.** If the mail provider
   errors, a legitimate payment verification is undone. That is worse
   than a missing email.

Missing email → member resends. Rolled-back payment → member calls support.

## The notification matrix

| Type                            | Email | In-app | Consent gate         |
| ------------------------------- | ----- | ------ | -------------------- |
| `registration_welcome`          | ✅    | ✅     | None — transactional |
| `payment_submitted`             | ✅    | ✅     | None — transactional |
| `payment_verified`              | ✅    | ✅     | None — transactional |
| `payment_rejected`              | ✅    | ✅     | None — transactional |
| `tier_activated`                | ✅    | ✅     | None — transactional |
| `certificate_issued`            | ✅    | ✅     | None — transactional |
| Session reminders (Phase 2)     | ✅    | ✅     | None — transactional |

**Transactional notifications do not require marketing consent.** They
are necessary to deliver the service the member paid for. Sending them
without consent is correct. Sending _marketing_ without consent is a
breach — see [ndpa-compliance](../ndpa-compliance/SKILL.md).

Product announcements and community updates are **not in this table**,
because they are not Phase 1 notification types. They are marketing, they
need a `marketing` consent gate, and they arrive with the Phase 2 scope. If
one is ever added, give it a row here with its consent gate at the same
time.

If you add a notification type, decide its consent gate explicitly and
add it to this table. The default is **transactional**, but that default
must be a deliberate choice, not an oversight.

## Templates

Store templates as code, not in the database. Version them with the repo.

```
lib/notifications/templates/
  registration-welcome.ts
  payment-submitted.ts
  payment-verified.ts
  payment-rejected.ts
  tier-activated.ts
  certificate-issued.ts
```

Each template exports a subject and a body function:

```ts
// lib/notifications/templates/payment-verified.ts
import { formatNaira } from "@/lib/format";

export const paymentVerified = {
  subject: "Payment verified — your EHEMS tier is active",
  text: (data: { memberName: string; tierName: string; amountKobo: number }) =>
    `Hi ${data.memberName},\n\n` +
    `We've verified your payment of ${formatNaira(data.amountKobo)} ` +
    `for ${data.tierName}. Your tier is now active.\n\n` +
    `Sign in to your dashboard to access your programme materials ` +
    `and community links.\n\n` +
    `— EHEMS`,
};
```

**Templates render text first, HTML second.** Text is the source of
truth; HTML is a presentational wrapper. Members on 3G and cheap clients
will see text; it must be complete and readable on its own.

## The channel abstraction

The dispatch function routes by channel. In Phase 1 there are two live
channels: `email` and `in_app`. The `Channel` union includes the Phase 2
channels because the abstraction must accommodate them, but a channel with no
handler is a **build-time error, not a runtime stub** — see below.

```ts
// lib/notifications/channels/index.ts
type Channel = "email" | "in_app" | "sms" | "whatsapp" | "telegram";

// Phase 1 implements exactly these. There is deliberately no
// `sms: notImplemented` entry: a stub that throws is a stub that rots, and
// `AGENTS.md` §9 says not to build "just in case". `resolveChannels` returns
// only channels present in this map, and a Phase 2 channel is added by
// registering a handler here in one place.
const handlers: Record<string, ChannelHandler> = {
  email: emailHandler,
  in_app: inAppHandler,
};

async function dispatch(type: NotificationType, userId: string, args: object) {
  const user = await loadUser(userId);
  const channels = resolveChannels(type, user);
  const notification = await recordNotification(type, userId, args);

  // The Notification row is already committed by the time this runs, so a
  // provider failure cannot undo the business change.
  await Promise.allSettled(
    channels.map((ch) => handlers[ch].send(notification, user)),
  );
}

// The non-blocking entry point features call. It records the notification
// and hands delivery to the platform's background task queue, so neither the
// HTTP response nor the database transaction waits on SMTP. On a platform
// without a queue (a plain Node server) it falls back to setImmediate, which
// keeps the request off the delivery path without pretending to be durable.
export function dispatchAsync(
  type: NotificationType,
  userId: string,
  args: object,
): void {
  enqueueBackgroundTask(() => dispatch(type, userId, args));
}
```

**Do not `await` a send on the request path.** `dispatchAsync` returns
immediately. Awaiting `dispatch()` from a route handler means the admin's
"verify payment" click blocks on SMTP — precisely the failure this skill
exists to prevent. Tests that need to assert on a notification await the
`Notification` row (written synchronously) rather than the provider call.

**Phase 2 adds a handler, not a code path.** That is the whole point of
the abstraction. If adding SMS requires touching feature code, the
abstraction has failed.

The email handler itself wraps a provider SDK:

```ts
// lib/notifications/channels/email.ts
export const emailHandler: ChannelHandler = {
  async send(notification, user) {
    const template = templates[notification.type];
    const body = template.text(notification.data);
    const html = renderHtml(template, notification.data);

    await provider.send({
      to: user.email,
      subject: template.subject,
      text: body,
      html,
    });
  },
};
```

`provider` is an interface, not a concrete SDK. Swapping providers should
be a one-file change.

## The Notification record

Every notification writes a row, regardless of channel, regardless of
whether delivery succeeded.

```prisma
model Notification {
  id                String    @id @default(cuid())
  userId            String
  notificationType  String
  channel           String    // email | in_app | sms | ...
  subject           String?
  body              String
  status            String    // queued | sent | failed
  sentAt            DateTime?
  readAt            DateTime?
  createdAt         DateTime  @default(now())

  user              User      @relation(fields: [userId], references: [id])

  @@index([userId, readAt])
  @@index([status])
}
```

This is the in-app notification source and the audit trail for
notifications sent. FR-055 through FR-059 all assume you can show the
member what was sent and when.

**In-app notifications are just a channel.** They write a `Notification`
row with `channel = 'in_app'` and appear in the member dashboard.
Email is another channel writing its own row. The member sees both.

## Failure handling

Notifications are best-effort. A failed send must not break the feature
that triggered it.

```ts
await Promise.allSettled(dispatches); // ← allSettled, never all
```

- Log failures with the notification ID and the provider error.
- Mark the `Notification` row `failed`.
- **Do not retry inline.** Phase 1 has no queue; retries are a Phase 2
  concern. A failed send is logged and visible to admins.
- **Never rethrow.** A failed email must not surface as an error to the
  member or roll back a transaction.

The dashboard shows members their in-app notifications, so a failed email
is a degraded experience, not a lost one.

## Content rules

- **No PII in logs.** Never log the email body, the member's email
  address, or any content that includes personal data. Log the
  notification ID and the type.
- **No sensitive data in the subject line.** Subjects appear on lock
  screens. Payment amounts and tier names are fine; references are not.
- **No unsubscribe link on transactional mail.** It's misleading. Only
  marketing emails carry an unsubscribe link.
- **Plain language.** Same rules as the copy guidance in
  [design-system.md](../../rules/design-system.md).
- **Signed with "— EHEMS".** Consistent voice.

## Registration flow

Registration (FR-055) is a special case because the member is not yet
fully authenticated.

- Send the welcome email **after** the user row is committed.
- Include the WhatsApp Probation Room link, since that's the next step
  in the journey (§8.1).
- Do not block the response waiting for delivery.

## Payment flow

The manual payment workflow triggers three notifications:

| Trigger        | Notification                          | Notes                                             |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| Proof uploaded | `payment_submitted`                   | Confirms receipt; sets expectation of review time |
| Admin approves | `payment_verified` + `tier_activated` | Two rows; member gets both                        |
| Admin rejects  | `payment_rejected`                    | Must include the rejection reason verbatim        |

`payment_verified` and `tier_activated` are separate types even though
they fire together. They mean different things to the member and appear
as separate entries in their history.

## Certificate flow

`certificate_issued` fires after admin marks completion and triggers
issuance. Include:

- Certificate names (from `MemberCertificate` rows created in this batch)
- A link to the dashboard
- The verification ID for at least the first certificate

Do not attach PDFs. Link to the dashboard, where the member downloads.
Email attachments on 3G are a failure mode, not a feature.

## Adding a new notification type

1. Add the method to `notify` in `lib/notifications/index.ts`.
2. Add a template in `lib/notifications/templates/`.
3. Add the type to the notification matrix above with its consent gate.
4. Call it from a feature **after** the relevant transaction commits.
5. Add a test asserting the `Notification` row is written.

If you cannot decide the consent gate, the answer is not "pick one" —
it's "ask the client."

## NDPA notes

Notifications are a personal-data touchpoint:

- Email address is personal data. Never log it.
- Notification content may include personal data (tier, amounts). Same
  rule — never log bodies.
- `Notification` rows are retained per the retention policy. Email bodies
  are usually shorter retention than in-app rows; agree the periods and
  seed them.
- Marketing notifications require `marketing` consent. Track it and honour
  withdrawal within one dispatch cycle.

## Common mistakes

1. **Calling the provider SDK from a feature.** Defeats the abstraction.
   Call `notify.*` instead.
2. **Sending inside a transaction.** See the ordering rule above.
3. **Using `Promise.all`.** One failure rejects the batch. Use
   `allSettled`.
4. **Rethrowing send failures.** Breaks the calling feature. Log and move
   on.
5. **Not writing a `Notification` row.** In-app delivery and audit both
   depend on it.
6. **Logging the body.** It contains personal data. Log IDs, not content.
7. **Marketing content in a transactional email.** A tier activation
   email that also promotes a new programme needs `marketing` consent for
   the promotional part, or the promotional part must be removed.
8. **Attaching PDFs.** Link to the dashboard instead.
9. **Unsubscribe link on transactional mail.** Misleading; members may
   click it and stop receiving payment confirmations.

## What to test

- [ ] Registration writes a `Notification` row and sends an email
- [ ] Payment submission writes a `Notification` row
- [ ] Payment verification writes rows for both `payment_verified` and
      `tier_activated`
- [ ] Payment rejection includes the rejection reason verbatim
- [ ] Certificate issuance includes the certificate names
- [ ] A failing email provider does not break the calling feature
- [ ] The feature's transaction commits even if the notification fails
- [ ] No PII appears in logs (inspect log output)
- [ ] In-app notifications appear in the member dashboard unread list
- [ ] Marketing notifications check `marketing` consent before sending
- [ ] Transactional notifications ignore marketing consent

## Done when

- [ ] The notification is dispatched through `notify.*`, not directly
- [ ] A template exists, with text as the source of truth
- [ ] The dispatch happens **after** the relevant transaction commits
- [ ] A `Notification` row is written
- [ ] Failures are logged and swallowed, not rethrown
- [ ] No PII in logs
- [ ] The consent gate is explicitly decided and documented
- [ ] Tests above pass for the new type
- [ ] Typecheck, lint, and tests pass

```

```
