import AgentAPI from "apminsight";
import http from "node:http";
import express from "express";
import { securityMiddleware } from "./arcjet.js";
import { commentaryRouter } from "./routes/commentary.js";
import { matchRouter } from "./routes/matches.js";
import { attachWebSocketServer } from "./ws/server.js";

const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "0.0.0.0";

const apmLicenseKey = process.env.APM_LICENSE_KEY;
if (apmLicenseKey) {
	AgentAPI.config({
		licenseKey: apmLicenseKey,
		appName: "sportz",
		port: PORT,
	});
} else {
	console.warn("APM_LICENSE_KEY is not set; skipping APM initialization.");
}

const app = express();
const server = http.createServer(app);

app.use(express.json());

app.get("/", (req, res) => {
	res.send("Server is running");
});

app.use(securityMiddleware());

app.use("/matches", matchRouter);
app.use("/matches/:id/commentary", commentaryRouter);

const { broadcastMatchCreated, broadcastCommentary } =
	attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

server.listen(PORT, HOST, () => {
	const baseUrl =
		HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
	console.log(`Server started at ${baseUrl}`);
	console.log(`WebSocket is running on ${baseUrl.replace("http", "ws")}/ws`);
});
