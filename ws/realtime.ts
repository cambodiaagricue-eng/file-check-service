import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";

type ClientInfo = {
  ws: WebSocket;
  userId?: string;
};

const clients = new Set<ClientInfo>();
let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: HttpServer) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const userId = new URL(req.url || "", "http://localhost").searchParams.get("userId") || undefined;
    const client: ClientInfo = { ws, userId };
    clients.add(client);

    ws.on("close", () => {
      clients.delete(client);
    });
  });
}

export function broadcast(event: string, payload: unknown) {
  const message = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

export function notifyUsers(userIds: string[], event: string, payload: unknown) {
  const targetSet = new Set(userIds);
  const message = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (
      client.userId &&
      targetSet.has(client.userId) &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(message);
    }
  }
}
