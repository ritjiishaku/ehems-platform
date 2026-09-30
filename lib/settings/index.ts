/**
 * Read-only access to SystemSetting values.
 *
 * Settings are configuration, not a second source of domain state. Callers
 * should ask for the setting they need and apply its business meaning in their
 * own domain module; this file deliberately does not interpret payment modes or
 * retention periods.
 */

import { prisma } from '../db/client';

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return setting?.value ?? null;
}

export async function getSettings(keys: readonly string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });

  return Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
}
