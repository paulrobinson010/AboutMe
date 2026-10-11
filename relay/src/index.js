/* Putt. live relay.
 *
 * A game's scorer and anyone watching connect to the same room over a
 * WebSocket, and every message from one is passed to the others. That is
 * all it does. It never sees a score: the page encrypts the scorecard
 * before sending (AES-GCM), and the key lives in the part of the link
 * after the "#", which browsers never send anywhere. It stores nothing:
 * a room exists only in memory while someone is connected to it.
 *
 *   wss://<relay>/room/<room-id>
 */
import { DurableObject } from "cloudflare:workers";

const ROOM_ID = /^[A-Za-z0-9_-]{16,64}$/;   // the page makes 22-character ids
const MAX_MESSAGE = 16 * 1024;              // a big card is ~2 kB encrypted
const MAX_PEOPLE = 64;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/") return new Response("Putt. relay — nothing to see here.\n");
    const m = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!m || !ROOM_ID.test(m[1])) return new Response("Not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    // Only our own pages may open rooms; anything else is turned away.
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(req.headers.get("Origin") || "")) return new Response("Forbidden", { status: 403 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keep-alives are answered without waking the room up.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(req) {
    if (this.ctx.getWebSockets().length >= MAX_PEOPLE) return new Response("Room full", { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    // Hibernation API: the room can sleep between messages without
    // dropping anyone, which keeps it well inside the free plan.
    this.ctx.acceptWebSocket(server);
    this.count();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_MESSAGE) return;
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws) { try { peer.send(message); } catch (_) {} }
    }
  }

  webSocketClose(ws) { try { ws.close(); } catch (_) {} this.count(); }
  webSocketError(ws) { this.count(); }

  // Everyone hears how many people are in the room, so the scorer can see
  // how many are watching.
  count() {
    const peers = this.ctx.getWebSockets().filter((w) => w.readyState === 1 || w.readyState === 0);
    const msg = JSON.stringify({ t: "n", n: peers.length });
    for (const peer of peers) { try { peer.send(msg); } catch (_) {} }
  }
}
