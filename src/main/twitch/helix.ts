import * as db from "../db";
import { getClientId, refreshAccessToken } from "./auth";

const HELIX = "https://api.twitch.tv/helix";

/** Calls a Helix endpoint with the streamer token, refreshing it once on 401. */
export async function helix(
  path: string,
  init: { method?: string; body?: unknown } = {},
  retry = true
): Promise<any> {
  const streamer = db.getStreamer();
  const clientId = getClientId();
  if (!streamer || !clientId) throw new Error("Twitch account is not linked");

  const res = await fetch(`${HELIX}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${streamer.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {})
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return helix(path, init, false);
  }
  if (res.status === 204) return null;

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Helix ${init.method ?? "GET"} ${path} failed (${res.status}): ${data.message ?? "unknown"}`);
  }
  return data;
}

export interface HelixUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

export async function getUserByLogin(login: string): Promise<HelixUser | null> {
  const data = await helix(`/users?login=${encodeURIComponent(login.replace(/^@/, "").toLowerCase())}`);
  return data.data?.[0] ?? null;
}

/** Sends a chat message to the streamer's own channel as the streamer. */
export async function sendChatMessage(message: string): Promise<void> {
  const streamer = db.getStreamer();
  if (!streamer) return;
  try {
    await helix("/chat/messages", {
      method: "POST",
      body: {
        broadcaster_id: streamer.id,
        sender_id: streamer.id,
        message: message.slice(0, 480)
      }
    });
  } catch (err) {
    console.error("Failed to send chat message:", err);
  }
}

export async function createEventSubSubscription(
  type: string,
  version: string,
  condition: Record<string, string>,
  sessionId: string
): Promise<void> {
  await helix("/eventsub/subscriptions", {
    method: "POST",
    body: {
      type,
      version,
      condition,
      transport: { method: "websocket", session_id: sessionId }
    }
  });
}
