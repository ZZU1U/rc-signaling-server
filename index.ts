import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { type Viewer, type Streamer, MessageSchema } from './schemas';

//import * as sdpTransform from 'sdp-transform';
dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET;
const SERVER_URL = process.env.SERVER_URL;
const SERVICE_JWT = process.env.SERVICE_JWT;

const peerToId = new Map<Bun.ServerWebSocket<unknown>, string>();
const streamers = new Map<string, Streamer>();
const viewers = new Map<string, Viewer>();

console.log("Starting siglaing server on 8080 port")

console.assert(JWT_SECRET)

const update_car_status = async (id, status) => {
	const response = await fetch(`${SERVER_URL}/car`, {
	  method: "UPDATE",
	  body: JSON.stringify({ id, is_one: status }),
	  headers: { "Content-Type": "application/json", "Authorization": `Bearer: ${SERVICE_JWT}` },
	});

	const body = await response.json();

	console.log(body)
}

Bun.serve({
	port: 8080,
	fetch(req, server) {
		const url = new URL(req.url);

		// Handle WebSocket upgrade
		if (url.pathname === "/ws") {
			if (server.upgrade(req, { })) {
				return; // WebSocket handshake will continue in 'upgrade' handler
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Basic HTTP response
		if (url.pathname === "/streamers") {
			return Response.json({
				streamers: streamers.values().toArray()
			});
		}

		return new Response("Not Found", { status: 404 });
	}, // upgrade logic
	websocket: {
		async message(ws, message: string) {
			const result = await MessageSchema.safeParseAsync(JSON.parse(message));
			if (!result.success) {
				console.log(result.error)
				ws.send(JSON.stringify({
					type: 'error',
					msg: result.error
				}))
				return;
			}

			const data = result.data;


			switch (data.type) {
				case 'register': {
					let payload: jwt.JwtPayload;
					try {
						payload = jwt.verify(data.jwt, JWT_SECRET);

						if (payload.sub !== data.uuid) 
							throw Error()

						// TODO also check users to be viewers and cars to be streamers
						// (turned off for debug purpose)
					} catch (err) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: `nvalid JWT ${err}`,
						}))
						return;
					}

					peerToId.set(ws, data.uuid);

					if (data.role == 'streamer') {
						streamers.set(
							data.uuid,
							{
								id: data.uuid,
								socket: ws,
								viewer: null,
							}
						)
						await update_car_status(data.uuid, true)
					} else {
						viewers.set(
							data.uuid,
							{
								id: data.uuid,
								socket: ws,
								streamer: null,
							}
						)
					}

					console.log(`Neew peer joined as ${data.role} with id: ${data.uuid}`)
					break;
				}
				case 'offer': {
					const viewer = viewers.get(data.uuid)

					if (!viewer) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'No viewer found'
						}));
						return;
					}

					if (viewer.streamer) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Viewer is busy'
						}));
						return;
					}

					const streamer = streamers.get(data.to)

					if (!streamer) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Streamer not found'
						}));
						return;
					}
					if (streamer.viewer) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Streamer is busy'
						}));
						return;
					}

					streamer.socket.send(JSON.stringify(data))

					viewer.streamer = streamer.id;
					streamer.viewer = data.uuid;
					break;
				}
				case 'answer': {
					let streamer = streamers.get(data.uuid)!

					if (!streamer) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Streamer not found'
						}));
						return;
					}
					if (streamer.viewer != data.to) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Streamer is busy'
						}));
						return;
					}

					let viewer = viewers.get(data.to)
					if (!viewer) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'No viewer found'
						}));
						return;
					}

					if (viewer.streamer != data.uuid) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Viewer is busy'
						}));
						return;
					}

					viewer.socket.send(JSON.stringify(data))

					break;
				}
				case 'ice-candidate': {
					const sender = streamers.get(data.uuid)! || viewers.get(data.uuid)!

					if (!sender) {
						ws.send(JSON.stringify({
							type: 'error',
							msg: 'Unregistered sender'
						}))
					}

					const socket = streamers.get(data.to)!.socket || viewers.get(data.to)!.socket;

					socket.send(JSON.stringify(data))
					break;
				}
			}
			console.log(`streamers: ${streamers.keys().toArray()}`)
			console.log(`viewers: ${viewers.keys().toArray()}`)
			//console.log(streamers, viewers);
		}, // a message is received
		async open(ws) {
			console.log(`Connected new fwiend`)
			console.log(`streamers: ${streamers.keys().toArray()}`)
			console.log(`viewers: ${viewers.keys().toArray()}`)
		}, // a socket is opened
		async close(ws, code, message) {
			console.log("We lost one friend")
			const uuid = peerToId.get(ws)

			if (!uuid)
				return;

			const viewer = viewers.get(uuid)
			const streamer = streamers.get(uuid)

			if (viewer) {
				viewers.delete(uuid);
				if (viewer.streamer) {
					const streamer = streamers.get(viewer.streamer);
					if (streamer) {
						streamer.viewer = null;
						streamer.socket.send(JSON.stringify({
							type: 'error',
							msg: 'Viewer disconnected'
						}))
					}
				}
			}

			if (streamer) {
				streamers.delete(uuid);
				await update_car_status(uuid, false);
				if (streamer.viewer) {
					const viewer = viewers.get(streamer.viewer);
					if (viewer) {
						viewer.streamer = null;
						viewer.socket.send(JSON.stringify({
							type: 'error',
							msg: 'Streamer disconnected'
						}))
					}
				}
			}
		}, // a socket is closed
		// async drain(ws) { }, // the socket is ready to receive more data
	},
});
