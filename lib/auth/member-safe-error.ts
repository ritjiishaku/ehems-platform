/**
 * An error whose message is deliberately written for a member to read, and is
 * therefore safe to render on a public page.
 *
 * This exists because `error.message` reaching a form is otherwise a disclosure
 * bug, not a style question. When the production database had no schema,
 * registration rendered this to unauthenticated visitors:
 *
 *   Invalid `prisma.user.findUnique()` invocation: The table `public.user`
 *   does not exist in the current database.
 *
 * Every unexpected error looks like that — table names, column names,
 * constraint names, pool timeouts — and the auth pages are the most reachable
 * place in the app to find them. Marking the messages that are *meant* to be
 * read makes the unsafe ones the default: an unlabelled `Error` reaching an
 * action is now treated as internal by construction.
 *
 * The test is simple: if the text would tell a member something about our
 * schema, infrastructure, or another account, it does not belong here.
 *
 * Mirrors `CsrfError` in `./csrf.ts`, which relies on the same `instanceof`
 * discrimination at the action boundary.
 */
export class MemberSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemberSafeError';
  }
}

/**
 * Reduces an unknown throw to a string a member is allowed to see.
 *
 * `MemberSafeError` messages pass through; everything else is treated as
 * internal, logged server-side, and replaced with `fallback`. Callers supply the
 * fallback so the wording stays specific to the action.
 *
 * `context` labels the log line. Log the cause, not the credential: callers pass
 * a fixed string like `'registration'`, never a form body.
 *
 * Lives here rather than inline in the action so it is importable from a test —
 * an `'use server'` module pulls in `next/headers` and Prisma, which cannot be
 * exercised under jsdom.
 */
export function memberFacingAuthError(error: unknown, context: string, fallback: string): string {
  if (error instanceof MemberSafeError) return error.message;
  console.error(`[auth] ${context} failed:`, error);
  return fallback;
}
