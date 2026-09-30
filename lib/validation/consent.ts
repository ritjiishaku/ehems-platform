import { z } from 'zod';

export const consentWithdrawalSchema = z.object({
  consentId: z.string().trim().min(1).max(64),
});
