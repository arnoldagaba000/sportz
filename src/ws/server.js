import { WebSocket, WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

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
 * Sends a JSON payload to all connected clients of the given WebSocketServer.
 *
 * If a client is not currently open, it is skipped.
 *
 * @param {WebSocketServer} wss - The WebSocketServer to broadcast the payload over.
 * @param {Object} payload - The JSON payload to broadcast.
 */
function broadcast(wss, payload) {
	for (const client of wss.clients) {
		if (client.readyState !== WebSocket.OPEN) {
			continue;
		}

		client.send(JSON.stringify(payload));
	}
}

/**
 * Attaches a WebSocketServer to a given HTTP server.
 * The WebSocketServer is configured to listen on the "/ws" path.
 * The server is configured to allow a maximum payload of 1MB.
 * The server is also configured to perform rate limiting and access control using Arcjet.
 * If the request is allowed, the server sends a welcome message to the client.
 * If the request is rate limited, the server sends a 1013 error code with a "Too many requests" reason.
 * If the request is denied, the server sends a 1008 error code with an "Access Denied" reason.
 * If there is an error with Arcjet, the server sends a 1011 error code with a "Server security error" reason.
 * Every 30 seconds, the server sends a ping message to all connected clients.
 * If a client does not respond to the ping message, the server terminates the connection.
 * When the server is closed, the server clears the interval timer.
 * @param {http.Server} server - The HTTP server to attach the WebSocketServer to.
 * @returns {{ broadcastMatchCreated: (match: Object) => void }}
 */
export function attachWebSocketServer(server) {
	const wss = new WebSocketServer({
		server,
		path: "/ws",
		maxPayload: 1024 * 1024,
	});

	wss.on("connection", async (socket) => {
		if (wsArcjet) {
			try {
				const decision = await wsArcjet.protect(socket);
				if (decision.isDenied) {
					const code = decision.reason.isRateLimit() ? 1013 : 1008;
					const reason = decision.reason.isRateLimit()
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

		sendJson(socket, { type: "welcome" });

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

	function broadcastMatchCreated(match) {
		broadcast(wss, { type: "match_created", data: match });
	}

	return { broadcastMatchCreated };
}
