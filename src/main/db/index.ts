import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";
import type {
  Faction, OverlayKind, OverlaySettings, Season, SeasonState, Theme, Viewer
} from "../../shared/types";
import { DEFAULT_LEADERBOARD_SETTINGS, DEFAULT_SORTER_SETTINGS } from "../../shared/types";

let db: Database.Database;

export function openDatabase(): void {
  const file = path.join(app.getPath("userData"), "faction-frenzy.sqlite");
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS streamer (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      display_name TEXT NOT NULL,
      profile_image_url TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      linked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS factions (
      name TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      image_url TEXT NOT NULL,
      points REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS viewers (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      faction TEXT NOT NULL,
      points REAL NOT NULL DEFAULT 0,
      sorted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS point_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      faction TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo TEXT,
      factions_json TEXT NOT NULL,
      source_preset_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overlay_settings (
      overlay TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seasons (
      slot TEXT PRIMARY KEY CHECK (slot IN ('current', 'next')),
      data_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS season_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_json TEXT NOT NULL,
      archived_at INTEGER NOT NULL
    );
  `);
}

// ---------- app state ----------

export function getState(key: string): string | null {
  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function setState(key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

// ---------- streamer ----------

export interface StreamerRow {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string | null;
  access_token: string;
  refresh_token: string;
  linked_at: number;
}

export function getStreamer(): StreamerRow | null {
  return (db.prepare("SELECT * FROM streamer LIMIT 1").get() as StreamerRow | undefined) ?? null;
}

export function saveStreamer(row: StreamerRow): void {
  db.prepare("DELETE FROM streamer WHERE id <> ?").run(row.id);
  db.prepare(`
    INSERT INTO streamer (id, login, display_name, profile_image_url, access_token, refresh_token, linked_at)
    VALUES (@id, @login, @display_name, @profile_image_url, @access_token, @refresh_token, @linked_at)
    ON CONFLICT(id) DO UPDATE SET
      login = excluded.login,
      display_name = excluded.display_name,
      profile_image_url = excluded.profile_image_url,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      linked_at = excluded.linked_at
  `).run(row);
}

export function updateTokens(accessToken: string, refreshToken: string): void {
  db.prepare("UPDATE streamer SET access_token = ?, refresh_token = ?").run(accessToken, refreshToken);
}

export function deleteStreamer(): void {
  db.prepare("DELETE FROM streamer").run();
}

// ---------- factions (active theme) ----------

interface FactionRow {
  name: string;
  color: string;
  image_url: string;
  points: number;
  sort_order: number;
}

export function getFactions(): Faction[] {
  const rows = db.prepare("SELECT * FROM factions ORDER BY sort_order").all() as FactionRow[];
  return rows.map((r) => ({ name: r.name, color: r.color, imageUrl: r.image_url, points: r.points }));
}

/** Replaces the active faction set, preserving points of factions that keep their name. */
export function setFactions(factions: Omit<Faction, "points">[]): void {
  const existing = new Map(getFactions().map((f) => [f.name, f.points]));
  const replace = db.transaction(() => {
    db.prepare("DELETE FROM factions").run();
    const insert = db.prepare(
      "INSERT INTO factions (name, color, image_url, points, sort_order) VALUES (?, ?, ?, ?, ?)"
    );
    factions.forEach((f, i) => insert.run(f.name, f.color, f.imageUrl, existing.get(f.name) ?? 0, i));
  });
  replace();
}

export function addFactionPoints(name: string, amount: number): void {
  db.prepare("UPDATE factions SET points = points + ? WHERE lower(name) = lower(?)").run(amount, name);
}

// ---------- viewers ----------

interface ViewerRow {
  user_id: string;
  username: string;
  faction: string;
  points: number;
  sorted_at: number;
}

function toViewer(r: ViewerRow): Viewer {
  return { userId: r.user_id, username: r.username, faction: r.faction, points: r.points, sortedAt: r.sorted_at };
}

export function getViewer(userId: string): Viewer | null {
  const row = db.prepare("SELECT * FROM viewers WHERE user_id = ?").get(userId) as ViewerRow | undefined;
  return row ? toViewer(row) : null;
}

export function getViewerByLogin(username: string): Viewer | null {
  const row = db.prepare("SELECT * FROM viewers WHERE lower(username) = lower(?)").get(username) as
    ViewerRow | undefined;
  return row ? toViewer(row) : null;
}

/** Inserts or re-sorts a viewer, preserving accumulated points. */
export function saveViewerFaction(userId: string, username: string, faction: string): void {
  db.prepare(`
    INSERT INTO viewers (user_id, username, faction, points, sorted_at)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      faction = excluded.faction,
      sorted_at = excluded.sorted_at
  `).run(userId, username, faction, Date.now());
}

export function addViewerPoints(userId: string, amount: number): void {
  db.prepare("UPDATE viewers SET points = points + ? WHERE user_id = ?").run(amount, userId);
}

export function getFactionMembersRanked(faction: string): Viewer[] {
  const rows = db.prepare(
    "SELECT * FROM viewers WHERE lower(faction) = lower(?) ORDER BY points DESC, sorted_at"
  ).all(faction) as ViewerRow[];
  return rows.map(toViewer);
}

export function recordPointEvent(
  userId: string, username: string, faction: string, amount: number, type: string
): void {
  db.prepare(
    "INSERT INTO point_events (user_id, username, faction, amount, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(userId, username, faction, amount, type, Date.now());
}

// ---------- custom themes ----------

interface ThemeRow {
  id: string;
  name: string;
  logo: string | null;
  factions_json: string;
  source_preset_id: string | null;
  created_at: number;
}

export function getCustomThemes(): Theme[] {
  const rows = db.prepare("SELECT * FROM custom_themes ORDER BY created_at DESC").all() as ThemeRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    logo: r.logo ?? "/img/default.png",
    factions: JSON.parse(r.factions_json),
    custom: true,
    sourcePresetId: r.source_preset_id
  }));
}

export function getCustomTheme(id: string): Theme | null {
  const row = db.prepare("SELECT * FROM custom_themes WHERE id = ?").get(id) as ThemeRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    logo: row.logo ?? "/img/default.png",
    factions: JSON.parse(row.factions_json),
    custom: true,
    sourcePresetId: row.source_preset_id
  };
}

export function saveCustomTheme(
  name: string, factions: Omit<Faction, "points">[], logo: string | null, sourcePresetId: string | null
): string {
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    "INSERT INTO custom_themes (id, name, logo, factions_json, source_preset_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, name, logo, JSON.stringify(factions), sourcePresetId, Date.now());
  return id;
}

export function deleteCustomTheme(id: string): void {
  db.prepare("DELETE FROM custom_themes WHERE id = ?").run(id);
}

// ---------- overlay settings ----------

const OVERLAY_DEFAULTS: Record<OverlayKind, OverlaySettings> = {
  sorter: DEFAULT_SORTER_SETTINGS,
  leaderboard: DEFAULT_LEADERBOARD_SETTINGS
};

export function getOverlaySettings(overlay: OverlayKind): OverlaySettings {
  const row = db.prepare("SELECT settings_json FROM overlay_settings WHERE overlay = ?").get(overlay) as
    { settings_json: string } | undefined;
  const saved = row ? (JSON.parse(row.settings_json) as OverlaySettings) : {};
  return { ...OVERLAY_DEFAULTS[overlay], ...saved };
}

export function saveOverlaySettings(overlay: OverlayKind, settings: OverlaySettings): void {
  db.prepare(
    "INSERT INTO overlay_settings (overlay, settings_json) VALUES (?, ?) " +
    "ON CONFLICT(overlay) DO UPDATE SET settings_json = excluded.settings_json"
  ).run(overlay, JSON.stringify(settings));
}

export function resetOverlaySettings(overlay: OverlayKind): void {
  db.prepare("DELETE FROM overlay_settings WHERE overlay = ?").run(overlay);
}

// ---------- seasons ----------

export function getSeasonState(): SeasonState {
  const rows = db.prepare("SELECT slot, data_json FROM seasons").all() as
    { slot: string; data_json: string }[];
  const bySlot = Object.fromEntries(rows.map((r) => [r.slot, JSON.parse(r.data_json) as Season]));
  return { current: bySlot.current ?? null, next: bySlot.next ?? null };
}

export function saveSeason(slot: "current" | "next", season: Season): void {
  db.prepare(
    "INSERT INTO seasons (slot, data_json) VALUES (?, ?) ON CONFLICT(slot) DO UPDATE SET data_json = excluded.data_json"
  ).run(slot, JSON.stringify(season));
}

/** Archives the given data and promotes the next season to current. Returns true if promoted. */
export function archiveSeasonAndActivateNext(archiveData: unknown): boolean {
  const next = db.prepare("SELECT data_json FROM seasons WHERE slot = 'next'").get() as
    { data_json: string } | undefined;
  const run = db.transaction(() => {
    db.prepare("INSERT INTO season_history (data_json, archived_at) VALUES (?, ?)")
      .run(JSON.stringify(archiveData), Date.now());
    if (!next) return false;
    db.prepare(
      "INSERT INTO seasons (slot, data_json) VALUES ('current', ?) ON CONFLICT(slot) DO UPDATE SET data_json = excluded.data_json"
    ).run(next.data_json);
    db.prepare("DELETE FROM seasons WHERE slot = 'next'").run();
    return true;
  });
  return run();
}
