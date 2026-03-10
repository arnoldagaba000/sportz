import { isSpoofedBot } from "@arcjet/inspect";
import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/node";
import "dotenv/config";

const arcjetKey = process.env.ARCJET_KEY;
const arcjetMode = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";

if (!arcjetKey) {
	throw new Error("ARCJET_KEY environment variable is not set");
}

export const httpArcjet = arcjet({
	key: arcjetKey,
	rules: [
		shield({ mode: arcjetMode }),
		detectBot({
			mode: arcjetMode,
			allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
		}),
		slidingWindow({ mode: arcjetMode, interval: "10s", max: 50 }),
	],
});

export const wsArcjet = arcjetKey
	? arcjet({
			key: arcjetKey,
			rules: [
				shield({ mode: arcjetMode }),
				detectBot({
					mode: arcjetMode,
					allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
				}),
				slidingWindow({ mode: arcjetMode, interval: "2s", max: 5 }),
			],
		})
		: null;

export function isLoopbackAddress(ip = "") {
	return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * A middleware function that uses Arcjet to protect against malicious traffic.
 * If the request is allowed, the middleware calls next() to continue the request.
 * If the request is denied, the middleware returns a 403 Forbidden response.
 * If the request is rate limited, the middleware returns a 429 Too Many Requests response.
 * If there is an error with Arcjet, the middleware returns a 503 Service Unavailable response.
 */
export function securityMiddleware() {
	return async (req, res, next) => {
		try {
			if (process.env.NODE_ENV !== "production") {
				const ip = req.ip ?? "";
				if (isLoopbackAddress(ip)) {
					return next();
				}
			}

			if (!req.headers["user-agent"]) {
				req.headers["user-agent"] = "unknown";
			}

			const decision = await httpArcjet.protect(req);
			const isSpoofed = decision.results?.some(isSpoofedBot) ?? false;

			if (decision.isDenied() || isSpoofed) {
				if (decision.isDenied() && decision.reason.isRateLimit()) {
					return res.status(429).json({ error: "Too many requests" });
				}

				return res.status(403).json({ error: "Forbidden" });
			}
		} catch (error) {
			console.error("Arcjet middleware error:", error);
			return res.status(503).json({ error: "Service Unavailable" });
		}

		next();
	};
}
