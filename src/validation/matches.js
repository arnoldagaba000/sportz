import { z } from "zod";

export const MATCH_STATUS = {
	SCHEDULED: "scheduled",
	LIVE: "live",
	FINISHED: "finished",
};

const isoDateStringSchema = z.iso.datetime();

export const listMatchesQuerySchema = z.object({
	limit: z.coerce.number().int().positive().max(100).optional(),
});

export const matchIdParamSchema = z.object({
	id: z.coerce.number().int().positive(),
});

export const createMatchSchema = z
	.object({
		sport: z.string().trim().min(1),
		homeTeam: z.string().trim().min(1),
		awayTeam: z.string().trim().min(1),
		startTime: isoDateStringSchema,
		endTime: isoDateStringSchema,
		homeScore: z.coerce.number().int().nonnegative().optional(),
		awayScore: z.coerce.number().int().nonnegative().optional(),
	})
	.superRefine((data, ctx) => {
		const startTimeMs = Date.parse(data.startTime);
		const endTimeMs = Date.parse(data.endTime);

		if (endTimeMs <= startTimeMs) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["endTime"],
				message: "endTime must be after startTime",
			});
		}
	});

export const updateScoreSchema = z.object({
	homeScore: z.coerce.number().int().nonnegative(),
	awayScore: z.coerce.number().int().nonnegative(),
});
