import * as db from "../db";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const DEVICE_URL = "https://id.twitch.tv/oauth2/device";
const VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";

export const SCOPES = [
  "channel:read:subscriptions",
  "channel:read:redemptions",
  "channel:manage:redemptions",
  "user:read:chat",
  "user:write:chat"
];

export type AuthStatus =
  | { status: "unlinked" }
  | { status: "pending"; userCode: string; verificationUri: string }
  | { status: "linked"; login: string; displayName: string }
  | { status: "error"; message: string };

interface DeviceFlow {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
  timer?: NodeJS.Timeout;
  error?: string;
}

let flow: DeviceFlow | null = null;
let onLinked: (() => void | Promise<void>) | null = null;

export function setOnLinked(cb: () => void | Promise<void>): void {
  onLinked = cb;
}

export function getClientId(): string | null {
  return db.getState("twitchClientId");
}

export function setClientId(clientId: string): void {
  db.setState("twitchClientId", clientId.trim());
}

export function getAuthStatus(): AuthStatus {
  if (flow?.error) return { status: "error", message: flow.error };
  if (flow) return { status: "pending", userCode: flow.userCode, verificationUri: flow.verificationUri };
  const streamer = db.getStreamer();
  if (streamer) return { status: "linked", login: streamer.login, displayName: streamer.display_name };
  return { status: "unlinked" };
}

/** Starts the Twitch Device Code Grant flow and begins polling for authorization. */
export async function startDeviceFlow(): Promise<{ userCode: string; verificationUri: string }> {
  const clientId = getClientId();
  if (!clientId) throw new Error("Twitch Client ID is not configured");
  cancelDeviceFlow();

  const res = await fetch(DEVICE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, scopes: SCOPES.join(" ") })
  });
  const data = (await res.json()) as {
    device_code: string; user_code: string; verification_uri: string; interval?: number; expires_in: number;
    message?: string;
  };
  if (!res.ok) throw new Error(data.message || `Device flow failed (${res.status})`);

  flow = {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: Math.max(data.interval ?? 5, 5),
    expiresAt: Date.now() + data.expires_in * 1000
  };
  schedulePoll(clientId);
  return { userCode: flow.userCode, verificationUri: flow.verificationUri };
}

export function cancelDeviceFlow(): void {
  if (flow?.timer) clearTimeout(flow.timer);
  flow = null;
}

function schedulePoll(clientId: string): void {
  if (!flow) return;
  flow.timer = setTimeout(() => void pollToken(clientId), flow.interval * 1000);
}

async function pollToken(clientId: string): Promise<void> {
  if (!flow) return;
  if (Date.now() > flow.expiresAt) {
    flow = { ...flow, error: "The device code expired. Try connecting again." };
    return;
  }
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: flow.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });
    const data = (await res.json()) as {
      access_token?: string; refresh_token?: string; message?: string;
    };
    if (res.ok && data.access_token && data.refresh_token) {
      await completeLink(clientId, data.access_token, data.refresh_token);
      return;
    }
    if (data.message === "authorization_pending") {
      schedulePoll(clientId);
      return;
    }
    flow = { ...flow, error: data.message || "Authorization failed" };
  } catch (err) {
    console.error("Device flow polling error:", err);
    schedulePoll(clientId);
  }
}

async function completeLink(clientId: string, accessToken: string, refreshToken: string): Promise<void> {
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` }
  });
  const data = (await res.json()) as { data?: { id: string; login: string; display_name: string; profile_image_url: string }[] };
  const user = data.data?.[0];
  if (!user) {
    flow = flow ? { ...flow, error: "Could not fetch the Twitch user profile" } : null;
    return;
  }
  db.saveStreamer({
    id: user.id,
    login: user.login,
    display_name: user.display_name,
    profile_image_url: user.profile_image_url,
    access_token: accessToken,
    refresh_token: refreshToken,
    linked_at: Date.now()
  });
  cancelDeviceFlow();
  console.log(`✅ Linked Twitch account: ${user.display_name} (${user.id})`);
  if (onLinked) await onLinked();
}

export function unlink(): void {
  cancelDeviceFlow();
  db.deleteStreamer();
}

/** Refreshes the stored access token. Returns the new token or null if refresh failed. */
export async function refreshAccessToken(): Promise<string | null> {
  const clientId = getClientId();
  const streamer = db.getStreamer();
  if (!clientId || !streamer) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: streamer.refresh_token
    })
  });
  if (!res.ok) {
    console.error("Token refresh failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  db.updateTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

/** True when the stored access token is currently valid. */
export async function validateToken(): Promise<boolean> {
  const streamer = db.getStreamer();
  if (!streamer) return false;
  const res = await fetch(VALIDATE_URL, {
    headers: { Authorization: `OAuth ${streamer.access_token}` }
  });
  return res.ok;
}
