import type {
  Faction, OverlayKind, OverlaySettings, SeasonState, Theme
} from "../../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export interface AppStatus {
  port: number;
  clientIdSet: boolean;
  auth:
    | { status: "unlinked" }
    | { status: "pending"; userCode: string; verificationUri: string }
    | { status: "linked"; login: string; displayName: string }
    | { status: "error"; message: string };
  eventsub: { state: string; error: string };
  profile: { id: string; login: string; displayName: string; profileImageUrl: string | null } | null;
}

export const api = {
  status: () => request<AppStatus>("/api/status"),
  saveClientId: (clientId: string) => post("/api/client-id", { clientId }),
  authStart: () => post<{ userCode: string; verificationUri: string }>("/api/auth/start"),
  authStatus: () => request<AppStatus["auth"]>("/api/auth/status"),
  logout: () => post("/api/auth/logout"),

  getTheme: () => request<{ factions: Faction[] }>("/api/theme"),
  applyTheme: (factions: Omit<Faction, "points">[]) => post("/api/theme", { factions }),
  getThemes: () => request<{ presets: Theme[]; custom: Theme[] }>("/api/themes"),
  getThemeDetails: (id: string) => request<Theme>(`/api/themes/${encodeURIComponent(id)}`),
  saveCustomTheme: (themeName: string, factions: Omit<Faction, "points">[], sourcePresetId?: string | null) =>
    post<{ themeId: string }>("/api/themes/custom", { themeName, factions, sourcePresetId }),
  deleteCustomTheme: (id: string) =>
    request(`/api/themes/custom/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getOverlaySettings: (overlay: OverlayKind) =>
    request<{ settings: OverlaySettings }>(`/api/overlay-settings/${overlay}`),
  saveOverlaySettings: (overlay: OverlayKind, settings: OverlaySettings) =>
    post(`/api/overlay-settings/${overlay}`, { settings }),
  resetOverlaySettings: (overlay: OverlayKind) => post(`/api/overlay-settings/${overlay}/reset`),

  getSeasons: () => request<SeasonState>("/api/seasons"),
  saveSeason: (slot: "current" | "next", season: unknown) => post(`/api/seasons/${slot}`, { season }),
  archiveSeason: (archiveData: unknown) => post<{ promoted: boolean }>("/api/seasons/archive", { archiveData }),

  getLeaderboard: () => request<{ factions: Faction[] }>("/api/leaderboard"),
  testSort: (username?: string) => post<{ faction: string }>("/api/test-sort", { username }),
  restartEventSub: () => post("/api/eventsub/restart")
};
