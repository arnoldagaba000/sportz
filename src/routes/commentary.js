import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/index.js";
import { commentary } from "../db/schema.js";
import {
	createCommentarySchema,
	listCommentaryQuerySchema,
} from "../validation/commentary.js";
import { matchIdParamSchema } from "../validation/matches.js";

export const commentaryRouter = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRouter.get("/", async (req, res) => {
	const paramsParsed = matchIdParamSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		res.status(400).json({
			error: "Invalid route parameters",
			details: paramsParsed.error.issues,
		});
		return;
	}

	const queryParsed = listCommentaryQuerySchema.safeParse(req.query);
	if (!queryParsed.success) {
		res.status(400).json({
			error: "Invalid query parameters",
			details: queryParsed.error.issues,
		});
		return;
	}

	const limit = Math.min(queryParsed.data.limit ?? 100, MAX_LIMIT);

	try {
		const data = await db
			.select()
			.from(commentary)
			.where(eq(commentary.matchId, paramsParsed.data.id))
			.orderBy(desc(commentary.createdAt))
			.limit(limit);

		res.json({ data });
	} catch {
		res.status(500).json({
			error: "Failed to list commentary",
		});
	}
});

commentaryRouter.post("/", async (req, res) => {
	const paramsParsed = matchIdParamSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		res.status(400).json({
			error: "Invalid match ID",
			details: paramsParsed.error.issues,
		});
		return;
	}

	const bodyParsed = createCommentarySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		res.status(400).json({
			error: "Invalid commentary payload",
			details: bodyParsed.error.issues,
		});
		return;
	}

	try {
		const [event] = await db
			.insert(commentary)
			.values({
				matchId: paramsParsed.data.id,
				...bodyParsed.data,
			})
			.returning();

		if (res.app.locals.broadcastCommentary) {
			res.app.locals.broadcastCommentary(event.matchId, event);
		}

		res.status(201).json({ data: event });
	} catch (error) {
		const errorMessage = String(error?.message ?? "");
		const isForeignKeyViolation =
			error?.code === "23503" ||
			(errorMessage.toLowerCase().includes("foreign key") &&
				errorMessage.includes("match_id"));

		if (isForeignKeyViolation) {
			res.status(404).json({ error: "Match not found" });
			return;
		}

		console.error("Failed to create commentary:", error);
		res.status(500).json({
			error: "Failed to create commentary",
		});
	}
});
