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
 * Browsers normally send `Origin`; when it is absent, `Referer` is the fallback
 * required by the security policy. Requests without either value fail closed.
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
  const origin = requestHeaders.get('origin') ?? requestHeaders.get('referer');
  const host = requestHeaders.get('host');

  if (!origin) {
    throw new CsrfError('Missing Origin header on a state-changing request');
  }
  if (!host) {
    throw new CsrfError('Missing Host header on a state-changing request');
  }

  let requestOrigin: URL;
  try {
    requestOrigin = new URL(origin);
  } catch {
    throw new CsrfError('Unparseable Origin or Referer header');
  }

  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const expectedProtocol =
    forwardedProtocol || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  if (requestOrigin.host !== host || requestOrigin.protocol !== `${expectedProtocol}:`) {
    throw new CsrfError('Cross-origin request rejected');
  }
}
