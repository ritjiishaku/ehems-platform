import { z } from 'zod';
import { nigerianPhoneSchema } from './phone';

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: nigerianPhoneSchema,
  profession: z.string().trim().min(2).max(100),
  healthcareSpecialty: z.string().trim().max(100).optional(),
  currentPassword: z.string().min(1).max(200),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
