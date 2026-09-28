/**
 * Origin verification for state-changing requests.
 *
 * `SameSite=Lax` already blocks a cross-site form POST from carrying the
 * session cookie, but it does not defend against a same-site subdomain: an
 * attacker controlling `evil.ehems.ng` is same-site with `ehems.ng`, so the
 * cookie rides along. The header check closes that gap, which is why
 * `docs/implementation-plan.md` §Phase 5 step 4 calls it mandatory rather than
 * belt-and-braces.
 *
 * Browsers send `Origin` on every non-GET request, so its absence on a mutation
 * is itself the anomaly and is treated as a failure.
 */

import { headers } from 'next/headers';

export class CsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsrfError';
  }
}

export async function assertSameOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');
  const host = requestHeaders.get('host');

  if (!origin) {
    throw new CsrfError('Missing Origin header on a state-changing request');
  }
  if (!host) {
    throw new CsrfError('Missing Host header on a state-changing request');
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new CsrfError(`Unparseable Origin header: ${origin}`);
  }

  if (originHost !== host) {
    throw new CsrfError(`Cross-origin request rejected: ${originHost} is not ${host}`);
  }
}
