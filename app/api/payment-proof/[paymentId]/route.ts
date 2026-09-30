/**
 * Serve a decrypted payment proof to an authorised admin.
 *
 * This is the narrowest read surface in the app and the one with the most
 * consequences. A payment proof is a bank statement fragment: it shows a
 * balance, an account name, and a spending habit. NDPA treats it as sensitive
 * data (SEC-004, SEC-017), and it is the most useful document in the building for
 * somebody impersonating a member. So the guards are stacked, deliberately:
 *
 *   1. **A session** — `requireRole`, so an anonymous request never reaches the
 *      database.
 *   2. **The §4.2 `payment.verify` grant** — a session is not a capability.
 *   3. **A signed, unexpired grant** minted only after NFR-008 re-auth. This is
 *      what a plain id-in-the-URL link would not have, and what keeps the URL
 *      from being a replayable bearer token in a proxy log.
 *   4. **The grant is bound to this payment and this admin**, so it cannot be
 *      replayed against another receipt or handed to a colleague.
 *   5. **An audit row**, because staff reading a member's financial record is
 *      itself an auditable event (SEC-007) — there is no diff on a read, so the
 *      actor, entity, and timestamp are the whole record.
 *   6. **The bytes are classified before they are served.** The type comes from
 *      the decrypted bytes, never from a stored column.
 *
 * Authorisation order matters: session, then permission, then grant, then load.
 * Not the other way round, so an unauthorised caller cannot use this route to
 * learn whether a payment id exists.
 *
 * ## Why this uses `getCurrentUser` and not `requireRole`
 *
 * The guards in `lib/auth/rbac.ts` redirect, which is right for a page and wrong
 * for a route handler: a `fetch` follows the redirect to the HTML login page and
 * receives `200 text/html` where it asked for JSON, so the caller cannot tell a
 * denied request from a broken one. Here the status code *is* the answer, so the
 * check is explicit and returns 401/403/404 per the table in
 * api-route-scaffolder. The role list passed to the check is the same two roles
 * `requireRole('admin', 'super_admin')` takes — no hierarchy, and the specific
 * capability is still the `payment.verify` grant below.
 */

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { forbidden, notFound, serverError, unauthenticated } from '@/lib/http';
import { hasPermission, isRoleKey } from '@/lib/permissions';
import { detectProofType, readProofObject } from '@/lib/payments/proofs';
import { verifyProofGrant } from '@/lib/payments/proof-grants';

/** A sensible cap on a decrypted proof, matching what validation allows on the way in. */
const MAX_SERVED_BYTES = 5 * 1024 * 1024;

type RouteContext = { params: Promise<{ paymentId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const admin = await getCurrentUser();
    if (!admin) {
      return unauthenticated();
    }
    if (!admin.role || !isRoleKey(admin.role)) {
      return forbidden();
    }
    if (admin.role !== 'admin' && admin.role !== 'super_admin') {
      return forbidden();
    }

    if (!hasPermission(admin, 'payment.verify')) {
      return forbidden('Your role does not include payment verification.');
    }

    const { paymentId } = await context.params;
    if (!paymentId) {
      return notFound('Not found.');
    }

    const url = new URL(request.url);
    const grant = url.searchParams.get('grant') ?? '';
    const check = verifyProofGrant(grant, paymentId, admin.id);
    if (!check.ok) {
      // 401 rather than 403: the grant is the credential, and saying "forbidden"
      // would imply the session was the thing that failed.
      return unauthenticated(check.message);
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, proofUrl: true, userId: true },
    });

    // A payment with no proof, and a payment that does not exist, get the same
    // answer. The queue renders "no proof attached" already, so the difference
    // here would only help someone probing ids.
    if (!payment?.proofUrl) {
      return notFound('No proof is attached to that payment.');
    }

    const bytes = await readProofObject(payment.proofUrl);
    if (bytes.length > MAX_SERVED_BYTES) {
      return notFound('That proof could not be read.');
    }

    const type = detectProofType(bytes);
    if (!type) {
      // Refusing to serve unclassifiable bytes is the safe direction. Falling back
      // to `application/octet-stream` would still hand an admin whatever is in
      // the file.
      return notFound('That proof could not be read.');
    }

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'PAYMENT_PROOF_VIEWED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: {
          memberId: payment.userId,
          bytes: bytes.length,
          mime: type.mime,
          via: 'payment_proof_route',
        },
      },
    });

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': type.mime,
        // `attachment` rather than `inline`: an admin should open the receipt
        // deliberately, not have the app render untrusted member-supplied bytes
        // into a page that also holds the session cookie.
        'content-disposition': `attachment; filename="payment-proof${type.extension}"`,
        'content-length': String(bytes.length),
        // Member financial data must not sit in a shared cache.
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return serverError(error, { route: 'payment-proof', operation: 'GET' });
  }
}
