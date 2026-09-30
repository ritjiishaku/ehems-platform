import { z } from 'zod';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export const attendanceMarkSchema = z.object({
  sessionId: z.string().trim().min(1),
  enrolmentId: z.string().trim().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  notes: z.string().trim().max(1000).optional().default(''),
});

export type AttendanceMarkInput = z.infer<typeof attendanceMarkSchema>;
