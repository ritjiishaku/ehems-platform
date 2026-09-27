/**
 * Prisma client singleton for EHEMS.
 *
 * Next.js hot-reload creates a new module instance on every file change,
 * which would open a new connection pool each time and exhaust the Neon
 * connection limit. The globalThis trick pins one instance across reloads
 * in development. In production each serverless invocation gets exactly one
 * client, so the guard is a no-op there.
 *
 * Import this — not `new PrismaClient()` — everywhere in lib/.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
