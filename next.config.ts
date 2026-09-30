import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Playwright suite talks to 127.0.0.1, not localhost. Without this, Next
  // blocks its own HMR socket as a cross-origin request in dev and the webserver
  // log fills with warnings that look like test failures.
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    // Next's default server-action body limit is 1 MB, which is under the 5 MB
    // payment-proof ceiling in `lib/payments/proofs.ts`. The alignment matters:
    // the Zod schema and the proof validator both refuse anything over 5 MB, and
    // this is the outer envelope that must not reject a valid file first. A
    // member photographing a receipt on a mid-range Android produces 2-4 MB.
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  // `lib/payments/proofs.ts` reads and writes encrypted receipt files by a
  // runtime-computed path — there is no static filename to import, which is the
  // entire point of the module. The `turbopackIgnore` annotations on those fs
  // calls are what stop the tracer falling back to a whole-project trace.
  //
  // This exclude is the second line of defence rather than the fix. The proof
  // store is member financial data (SEC-004): it must never be copied into a
  // build output, committed, or served as a static asset. If someone later
  // removes an annotation, or adds a new fs call that reads the store, this
  // still keeps the bytes out of `.next/`.
  //
  // Deployment requirement that goes with it: production must point
  // `PAYMENT_PROOF_STORAGE_DIR` at a persistent volume outside the project
  // directory, because the container filesystem does not survive a redeploy.
  outputFileTracingExcludes: {
    '/*': ['.storage/**/*'],
  },
};

export default nextConfig;
