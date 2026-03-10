import { isSpoofedBot } from "@arcjet/inspect";
import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const matchSubscribers = new Map();

/**
 * Subscribes the given WebSocket socket to the match with the given ID.
 * If the match ID is not already present in the subscribers map, a new set is created.
 * The socket is then added to the set of subscribers for the given match ID.
 *
 * @param {string} matchId - The ID of the match to subscribe to.
 * @param {WebSocket} socket - The WebSocket socket to subscribe.
 */
function subscribe(matchId, socket) {
	if (!matchSubscribers.has(matchId)) {
		matchSubscribers.set(matchId, new Set());
	}

	matchSubscribers.get(matchId).add(socket);
}

/**
 * Unsubscribes the given WebSocket socket from the match with the given ID.
 * If the socket is not currently subscribed to the match, this function does nothing.
 * If the socket is the last subscriber to the match, the subscription is removed from the map.
 * @param {number} matchId - The ID of the match to unsubscribe from.
 * @param {WebSocket} socket - The WebSocket to unsubscribe.
 */
function unsubscribe(matchId, socket) {
	const subscribers = matchSubscribers.get(matchId);
	if (!subscribers) {
		return;
	}

	subscribers.delete(socket);

	if (subscribers.size === 0) {
		matchSubscribers.delete(matchId);
	}
}

/**
 * Unsubscribes the given WebSocket socket from all matches it is currently subscribed to.
 * This function is used when a client disconnects from the WebSocket server.
 */
function cleanupSubscriptions(socket) {
	for (const matchId of socket.subscriptions) {
		unsubscribe(matchId, socket);
	}
}

/**
 * Sends a JSON payload over the given WebSocket socket.
 *
 * If the socket is not currently open, this function does nothing.
 *
 * @param {WebSocket} socket - The WebSocket to send the payload over.
 * @param {Object} payload - The JSON payload to send.
 */
function sendJson(socket, payload) {
	if (socket.readyState !== WebSocket.OPEN) {
		return;
	}

	socket.send(JSON.stringify(payload));
}

/**
 * Broadcasts a JSON payload to all connected clients.
 * This function iterates over all connected clients and sends the payload to each one.
 * If a client is not currently open, the payload is not sent to that client.
 * @param {WebSocket.Server} wss - The WebSocket server to broadcast to.
 * @param {Object} payload - The JSON payload to broadcast.
 */
function broadcastToAll(wss, payload) {
	for (const client of wss.clients) {
		if (client.readyState !== WebSocket.OPEN) {
			continue;
		}

		client.send(JSON.stringify(payload));
	}
}

/**
 * Broadcasts a JSON payload to all connected clients subscribed to the given match ID.
 * If there are no subscribers for the given match ID, this function does nothing.
 * @param {string} matchId - The ID of the match to broadcast to.
 * @param {Object} payload - The JSON payload to broadcast.
 */
function broadcastToMatch(matchId, payload) {
	const subscribers = matchSubscribers.get(matchId);
	if (!subscribers || subscribers.size === 0) {
		return;
	}

	const message = JSON.stringify(payload);
	for (const client of subscribers) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(message);
		}
	}
}

function isLocalIp(address) {
	return (
		address === "127.0.0.1" ||
		address === "::1" ||
		address === "::ffff:127.0.0.1"
	);
}

/**
 * Handles an incoming message from a WebSocket client.
 * If the message is a subscription request, the client is subscribed to the given match ID.
 * If the message is an unsubscription request, the client is unsubscribed from the given match ID.
 * If the message is malformed or invalid, an error response is sent to the client.
 * @param {WebSocket} socket - The WebSocket client that sent the message.
 * @param {string} data - The message data sent by the client.
 */
function handleMessage(socket, data) {
	let message;

	try {
		message = JSON.parse(data.toString());
	} catch {
		sendJson(socket, { type: "error", message: "Invalid JSON" });
	}

	if (message.type === "subscribe" && Number.isInteger(message.matchId)) {
		subscribe(message.matchId, socket);
		socket.subscriptions.add(message.matchId);
		sendJson(socket, { type: "subscribed", matchId: message.matchId });
		return;
	}

	if (message.type === "unsubscribe" && Number.isInteger(message.matchId)) {
		unsubscribe(message.matchId, socket);
		socket.subscriptions.delete(message.matchId);
		sendJson(socket, { type: "unsubscribed", matchId: message.matchId });
	}
}


/**
 * Attaches a WebSocket server to a given HTTP server.
 * The WebSocket server will broadcast newly created matches and commentary to all connected clients.
 * @param {http.Server} server - The HTTP server to attach the WebSocket server to.
 * @returns {object} - An object containing two functions: `broadcastMatchCreated` and `broadcastCommentary`.
 */
export function attachWebSocketServer(server) {
	const wss = new WebSocketServer({
		server,
		path: "/ws",
		maxPayload: 1024 * 1024,
	});

	wss.on("connection", async (socket, request) => {
		const remoteAddress = request.socket?.remoteAddress ?? "";
		const isLocal =
			process.env.NODE_ENV !== "production" && isLocalIp(remoteAddress);

		if (wsArcjet && !isLocal) {
			try {
				if (!request.headers["user-agent"]) {
					request.headers["user-agent"] = "unknown";
				}

				const decision = await wsArcjet.protect(request);
				const isSpoofed = decision.results?.some(isSpoofedBot) ?? false;

				if (decision.isDenied() || isSpoofed) {
					const code =
						decision.isDenied() && decision.reason.isRateLimit() ? 1013 : 1008;
					const reason =
						decision.isDenied() && decision.reason.isRateLimit()
							? "Too many requests"
							: "Access Denied";
					socket.close(code, reason);
					return;
				}
			} catch (error) {
				console.error("WS connection error:", error);
				socket.close(1011, "Server security error");
				return;
			}
		}

		socket.isAlive = true;
		socket.on("pong", () => {
			socket.isAlive = true;
		});

		socket.subscriptions = new Set();

		sendJson(socket, { type: "welcome" });

		socket.on("message", (data) => {
			handleMessage(socket, data);
		});

		socket.on("error", () => {
			socket.terminate();
		});

		socket.on("close", () => {
			cleanupSubscriptions(socket);
		});

		socket.on("error", console.error);
	});

	const interval = setInterval(() => {
		wss.clients.forEach((ws) => {
			if (ws.isAlive === false) {
				ws.terminate();
				return;
			}

			ws.isAlive = false;
			ws.ping();
		});
	}, 30000);

	wss.on("close", () => clearInterval(interval));

	/**
	 * Broadcasts a newly created match to all connected WebSocket clients.
	 * @param {object} match - The newly created match object.
	 */
	function broadcastMatchCreated(match) {
		broadcastToAll(wss, { type: "match_created", data: match });
	}

	/**
	 * Broadcasts a newly created commentary to all connected WebSocket clients
	 * that are subscribed to the given match.
	 * @param {number} matchId - The ID of the match to broadcast the commentary to.
	 * @param {object} comment - The commentary object to broadcast.
	 */
	function broadcastCommentary(matchId, comment) {
		broadcastToMatch(matchId, { type: "commentary", data: comment });
	}

	return { broadcastMatchCreated, broadcastCommentary };
}
