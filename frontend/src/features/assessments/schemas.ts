import { z } from "zod";

export const AssessmentAttemptSchema = z.object({
  id: z.number(),
  homework_id: z.number(),
  student_id: z.number(),
  status: z.string(),
  started_at: z.string(),
  submitted_at: z.string().nullable().optional(),
  total_time_seconds: z.number().optional(),
  active_time_seconds: z.number().optional(),
  grading_status: z.string().optional(),
  answers: z
    .array(
      z.object({
        id: z.number(),
        question_id: z.number(),
        answer: z.unknown(),
        is_correct: z.boolean().nullable().optional(),
        points_awarded: z.number().nullable().optional(),
        time_spent_seconds: z.number().optional(),
      }),
    )
    .optional(),
});

export const AssessmentAttemptBundleSchema = z.object({
  attempt: AssessmentAttemptSchema,
  set: z.unknown(),
  questions: z.array(z.unknown()),
});

