import { z } from "zod";

export const listCommentaryQuerySchema = z.object({
	limit: z.coerce.number().int().positive().max(100).optional(),
});

export const createCommentarySchema = z.object({
	minute: z.coerce.number().int().nonnegative(),
	sequence: z.coerce.number().int().nonnegative(),
	period: z.string().trim().min(1),
	eventType: z.string().trim().min(1),
	actor: z.string().trim().min(1),
	team: z.string().trim().min(1),
	message: z.string().trim().min(1),
	metadata: z.record(z.string(), z.unknown()),
	tags: z.array(z.string().trim().min(1)),
});
