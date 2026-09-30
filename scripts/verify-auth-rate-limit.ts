import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/db/client';
import { clearRateLimit, consumeRateLimit } from '../lib/auth/rate-limit';

async function main() {
  const key = `ci-rate-limit:${randomUUID()}`;
  const rule = { limit: 3, windowMs: 60_000 };

  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(key, rule)));

    assert.equal(
      results.filter((result) => result.allowed).length,
      rule.limit,
      'concurrent consumers must not exceed the shared database limit',
    );
    assert.equal((await consumeRateLimit(key, rule)).allowed, false);

    await clearRateLimit(key);
    assert.equal((await consumeRateLimit(key, rule)).allowed, true);
  } finally {
    await clearRateLimit(key);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
