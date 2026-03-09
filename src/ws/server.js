import { WebSocket, WebSocketServer } from "ws";

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
 *
 * The WebSocketServer is configured to listen on the path "/ws" and
 * has a maximum payload size of 1024 * 1024 bytes.
 *
 * When a client connects, a "welcome" JSON payload is sent to the
 * client.
 *
 * Every 30 seconds, the server sends a "pong" frame to each
 * client. If a client does not respond with a "pong" frame within
 * 30 seconds, the client is considered dead and is terminated.
 *
 * When the WebSocketServer is closed, the interval that sends the
 * "pong" frames is cleared.
 *
 * @param {http.Server} server - The HTTP server to attach the
 * WebSocketServer to.
 * @returns {Object} An object with a single method, broadcastMatchCreated,
 * which sends a "match_created" JSON payload to all connected clients.
 */
export function attachWebSocketServer(server) {
	const wss = new WebSocketServer({
		server,
		path: "/ws",
		maxPayload: 1024 * 1024,
	});

	wss.on("connection", (socket) => {
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
