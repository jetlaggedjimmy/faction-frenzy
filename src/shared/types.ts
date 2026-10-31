/** A faction a viewer can be sorted into. */
export interface Faction {
  name: string;
  color: string;
  imageUrl: string;
  points: number;
}

/** A preset or custom theme: a named set of factions. */
export interface Theme {
  id: string;
  name: string;
  logo: string;
  factions: Omit<Faction, "points">[];
  custom?: boolean;
  sourcePresetId?: string | null;
}

export interface Viewer {
  userId: string;
  username: string;
  faction: string;
  points: number;
  sortedAt: number;
}

export interface Season {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  reward?: string;
  theme?: string;
  themeId?: string;
  isOngoing?: boolean;
}

export interface SeasonState {
  current: Season | null;
  next: Season | null;
}

export type OverlayKind = "sorter" | "leaderboard";

export type OverlaySettings = Record<string, string>;

export const DEFAULT_SORTER_SETTINGS: OverlaySettings = {
  font: "Inter",
  fontWeight: "400",
  fontSize: "30",
  outlineColor: "#FFFFFF",
  outlineWidth: "1",
  imageHeight: "200",
  imageWidth: "200",
  paddingTop: "20",
  paddingBottom: "20",
  customCSS: ""
};

export const DEFAULT_LEADERBOARD_SETTINGS: OverlaySettings = {
  layout: "vertical",
  font: "Inter",
  fontWeight: "400",
  fontSize: "14",
  imageHeight: "50",
  imageWidth: "100",
  rowHeight: "50",
  rowWidth: "265",
  scrollSpeed: "40",
  customCSS: ""
};

/** Event pushed to the sorter overlay when a viewer gets sorted. */
export interface SortEvent {
  username: string;
  userId: string;
  faction: string;
  factionColor: string;
  isReturning: boolean;
}

export interface StreamerProfile {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
}

/** Messages sent over the local overlay WebSocket. */
export type WsServerMessage =
  | { type: "sort"; event: SortEvent }
  | { type: "leaderboard"; factions: Faction[] }
  | { type: "settingsChanged"; overlay: OverlayKind };

export type WsClientMessage = { type: "sortComplete"; event: SortEvent };
