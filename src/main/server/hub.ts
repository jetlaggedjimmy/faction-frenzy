import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { Faction, OverlayKind, SortEvent, WsServerMessage } from "../../shared/types";
import { sendChatMessage } from "../twitch/helix";

type Role = "sorter" | "leaderboard" | "panel";

const clients = new Map<WebSocket, Role>();
const sortQueue: SortEvent[] = [];
let sorterBusy = false;

export function initHub(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, req) => {
    const url = new URL(req.url ?? "/ws", "http://localhost");
    const role = (url.searchParams.get("role") ?? "panel") as Role;
    clients.set(socket, role);

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "sortComplete") {
          sorterBusy = false;
          void announceSort(msg.event as SortEvent);
          pumpSortQueue();
        }
      } catch {
        // ignore malformed client messages
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
      if (role === "sorter" && clientsWithRole("sorter").length === 0) {
        // No overlay left to animate — flush pending sorts straight to chat.
        sorterBusy = false;
        while (sortQueue.length > 0) void announceSort(sortQueue.shift()!);
      }
    });

    if (role === "sorter") pumpSortQueue();
  });
}

function clientsWithRole(role: Role): WebSocket[] {
  return [...clients.entries()]
    .filter(([socket, r]) => r === role && socket.readyState === WebSocket.OPEN)
    .map(([socket]) => socket);
}

function send(socket: WebSocket, message: WsServerMessage): void {
  socket.send(JSON.stringify(message));
}

/**
 * Queues a sort reveal for the overlay. When no overlay is connected the
 * chat announcement is sent immediately instead.
 */
export function enqueueSort(event: SortEvent): void {
  if (clientsWithRole("sorter").length === 0) {
    void announceSort(event);
    return;
  }
  sortQueue.push(event);
  pumpSortQueue();
}

function pumpSortQueue(): void {
  if (sorterBusy || sortQueue.length === 0) return;
  const sorters = clientsWithRole("sorter");
  if (sorters.length === 0) return;
  const event = sortQueue.shift()!;
  sorterBusy = true;
  for (const socket of sorters) send(socket, { type: "sort", event });
}

/** Chat announcement after the reveal (legacy /overlayComplete behaviour). */
async function announceSort(event: SortEvent): Promise<void> {
  const msg = event.isReturning
    ? `@${event.username}, you're already a proud member of ${event.faction}. 🛡️`
    : `🛡️ @${event.username} has joined ${event.faction}! The battle begins now! ⚔️`;
  await sendChatMessage(msg);
}

export function broadcastLeaderboard(factions: Faction[]): void {
  for (const socket of [...clientsWithRole("leaderboard"), ...clientsWithRole("panel")]) {
    send(socket, { type: "leaderboard", factions });
  }
}

export function broadcastSettingsChanged(overlay: OverlayKind): void {
  for (const [socket] of clients.entries()) {
    if (socket.readyState === WebSocket.OPEN) send(socket, { type: "settingsChanged", overlay });
  }
}

/** Tells every connected page (overlays and previews) that the active factions changed. */
export function broadcastThemeChanged(): void {
  for (const [socket] of clients.entries()) {
    if (socket.readyState === WebSocket.OPEN) send(socket, { type: "themeChanged" });
  }
}
