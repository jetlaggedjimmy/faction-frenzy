import WebSocket from "ws";
import * as db from "../db";
import { createEventSubSubscription } from "./helix";
import { handleEvent } from "./handlers";

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";

/** EventSub subscriptions used by the app; chat messages power the ! commands. */
function subscriptionsFor(broadcasterId: string): { type: string; version: string; condition: Record<string, string> }[] {
  return [
    { type: "channel.subscribe", version: "1", condition: { broadcaster_user_id: broadcasterId } },
    { type: "channel.subscription.gift", version: "1", condition: { broadcaster_user_id: broadcasterId } },
    { type: "channel.subscription.message", version: "1", condition: { broadcaster_user_id: broadcasterId } },
    {
      type: "channel.channel_points_custom_reward_redemption.add",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId }
    },
    {
      type: "channel.chat.message",
      version: "1",
      condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId }
    }
  ];
}

export type EventSubState = "disconnected" | "connecting" | "connected" | "error";

let ws: WebSocket | null = null;
let state: EventSubState = "disconnected";
let lastError = "";
let keepaliveTimer: NodeJS.Timeout | null = null;
let keepaliveSeconds = 10;
let reconnecting = false;
let stopped = true;

export function getEventSubState(): { state: EventSubState; error: string } {
  return { state, error: lastError };
}

export function startEventSub(): void {
  stopped = false;
  connect(EVENTSUB_URL, false);
}

export function stopEventSub(): void {
  stopped = true;
  clearKeepaliveWatchdog();
  ws?.close();
  ws = null;
  state = "disconnected";
}

function connect(url: string, isReconnect: boolean): void {
  if (stopped) return;
  const streamer = db.getStreamer();
  if (!streamer) return;

  state = "connecting";
  const socket = new WebSocket(url);
  ws = socket;

  socket.on("message", (raw) => void onMessage(socket, raw.toString(), isReconnect));
  socket.on("close", () => {
    if (socket !== ws) return;
    clearKeepaliveWatchdog();
    if (!stopped && !reconnecting) {
      state = "disconnected";
      setTimeout(() => connect(EVENTSUB_URL, false), 5000);
    }
    reconnecting = false;
  });
  socket.on("error", (err) => {
    lastError = err.message;
    console.error("EventSub socket error:", err.message);
  });
}

async function onMessage(socket: WebSocket, raw: string, isReconnect: boolean): Promise<void> {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  const type = msg.metadata?.message_type;

  if (type === "session_welcome") {
    keepaliveSeconds = msg.payload.session.keepalive_timeout_seconds ?? 10;
    resetKeepaliveWatchdog();
    state = "connected";
    lastError = "";
    if (!isReconnect) {
      try {
        const streamer = db.getStreamer()!;
        for (const sub of subscriptionsFor(streamer.id)) {
          await createEventSubSubscription(sub.type, sub.version, sub.condition, msg.payload.session.id);
        }
        console.log("✅ EventSub subscriptions created");
      } catch (err: any) {
        state = "error";
        lastError = err.message;
        console.error("Failed to create EventSub subscriptions:", err);
      }
    }
    return;
  }

  if (type === "session_keepalive") {
    resetKeepaliveWatchdog();
    return;
  }

  if (type === "session_reconnect") {
    // Twitch asks us to move to a new edge; subscriptions carry over.
    reconnecting = true;
    const url = msg.payload.session.reconnect_url;
    const old = socket;
    connect(url, true);
    ws?.once("open", () => old.close());
    return;
  }

  if (type === "notification") {
    resetKeepaliveWatchdog();
    try {
      await handleEvent(msg.payload.subscription.type, msg.payload.event);
    } catch (err) {
      console.error(`Error handling ${msg.payload.subscription?.type}:`, err);
    }
    return;
  }

  if (type === "revocation") {
    console.warn("EventSub subscription revoked:", msg.payload.subscription?.type, msg.payload.subscription?.status);
  }
}

function resetKeepaliveWatchdog(): void {
  clearKeepaliveWatchdog();
  keepaliveTimer = setTimeout(() => {
    console.warn("EventSub keepalive missed — reconnecting");
    ws?.terminate();
  }, (keepaliveSeconds + 5) * 1000);
}

function clearKeepaliveWatchdog(): void {
  if (keepaliveTimer) clearTimeout(keepaliveTimer);
  keepaliveTimer = null;
}
