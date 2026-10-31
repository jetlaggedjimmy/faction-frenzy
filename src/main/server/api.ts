import { Router } from "express";
import * as db from "../db";
import * as auth from "../twitch/auth";
import { getEventSubState, startEventSub, stopEventSub } from "../twitch/eventsub";
import { getPresetThemes, getThemeById } from "../services/themes";
import { getOrAssignFaction, pickRandomFaction, triggerOverlayUpdate } from "../services/sorter";
import { broadcastLeaderboard, broadcastSettingsChanged, broadcastThemeChanged } from "./hub";
import { PORT } from "../config";
import type { OverlayKind } from "../../shared/types";

function overlayKind(value: string): OverlayKind | null {
  return value === "sorter" || value === "leaderboard" ? value : null;
}

export function createApiRouter(): Router {
  const router = Router();

  // ---------- status & auth ----------

  router.get("/status", (_req, res) => {
    const streamer = db.getStreamer();
    res.json({
      port: PORT,
      clientIdSet: !!auth.getClientId(),
      auth: auth.getAuthStatus(),
      eventsub: getEventSubState(),
      profile: streamer
        ? {
            id: streamer.id,
            login: streamer.login,
            displayName: streamer.display_name,
            profileImageUrl: streamer.profile_image_url
          }
        : null
    });
  });

  router.post("/client-id", (req, res) => {
    const { clientId } = req.body ?? {};
    if (typeof clientId !== "string" || !clientId.trim()) {
      return res.status(400).json({ error: "Missing clientId" });
    }
    auth.setClientId(clientId);
    res.json({ success: true });
  });

  router.post("/auth/start", async (_req, res) => {
    try {
      const result = await auth.startDeviceFlow();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get("/auth/status", (_req, res) => {
    res.json(auth.getAuthStatus());
  });

  router.post("/auth/logout", (_req, res) => {
    stopEventSub();
    auth.unlink();
    res.json({ success: true });
  });

  // ---------- active theme / factions ----------

  router.get("/theme", (_req, res) => {
    res.json({ factions: db.getFactions() });
  });

  router.post("/theme", (req, res) => {
    const { factions } = req.body ?? {};
    if (!Array.isArray(factions) || factions.length === 0) {
      return res.status(400).json({ error: "Missing factions" });
    }
    db.setFactions(factions);
    broadcastLeaderboard(db.getFactions());
    broadcastThemeChanged();
    res.json({ success: true });
  });

  router.get("/leaderboard", (_req, res) => {
    res.json({ factions: db.getFactions() });
  });

  // ---------- themes ----------

  router.get("/themes", (_req, res) => {
    res.json({ presets: getPresetThemes(), custom: db.getCustomThemes() });
  });

  router.get("/themes/:id", (req, res) => {
    const theme = getThemeById(req.params.id);
    if (!theme) return res.status(404).json({ error: "Theme not found" });
    res.json(theme);
  });

  router.post("/themes/custom", (req, res) => {
    const { themeName, factions, sourcePresetId } = req.body ?? {};
    if (typeof themeName !== "string" || !themeName.trim() || !Array.isArray(factions) || factions.length === 0) {
      return res.status(400).json({ error: "Invalid custom theme payload" });
    }
    const streamer = db.getStreamer();
    const themeId = db.saveCustomTheme(
      themeName.trim(),
      factions,
      streamer?.profile_image_url ?? null,
      sourcePresetId ?? null
    );
    res.json({ success: true, themeId });
  });

  router.delete("/themes/custom/:id", (req, res) => {
    db.deleteCustomTheme(req.params.id);
    res.json({ success: true });
  });

  // ---------- overlay settings ----------

  router.get("/overlay-settings/:overlay", (req, res) => {
    const overlay = overlayKind(req.params.overlay);
    if (!overlay) return res.status(400).json({ error: "Unknown overlay" });
    res.json({ settings: db.getOverlaySettings(overlay) });
  });

  router.post("/overlay-settings/:overlay", (req, res) => {
    const overlay = overlayKind(req.params.overlay);
    const { settings } = req.body ?? {};
    if (!overlay || typeof settings !== "object" || settings === null) {
      return res.status(400).json({ error: "Missing or malformed payload" });
    }
    db.saveOverlaySettings(overlay, settings);
    broadcastSettingsChanged(overlay);
    res.json({ success: true });
  });

  router.post("/overlay-settings/:overlay/reset", (req, res) => {
    const overlay = overlayKind(req.params.overlay);
    if (!overlay) return res.status(400).json({ error: "Unknown overlay" });
    db.resetOverlaySettings(overlay);
    broadcastSettingsChanged(overlay);
    res.json({ success: true });
  });

  // ---------- seasons ----------

  router.get("/seasons", (_req, res) => {
    res.json(db.getSeasonState());
  });

  router.post("/seasons/current", (req, res) => {
    const { season } = req.body ?? {};
    if (!season) return res.status(400).json({ error: "Missing season data" });
    db.saveSeason("current", season);
    res.json({ success: true });
  });

  router.post("/seasons/next", (req, res) => {
    const { season } = req.body ?? {};
    if (!season) return res.status(400).json({ error: "Missing season data" });
    db.saveSeason("next", season);
    res.json({ success: true });
  });

  router.post("/seasons/archive", (req, res) => {
    const { archiveData } = req.body ?? {};
    if (!archiveData) return res.status(400).json({ error: "Missing archiveData" });
    res.json({ promoted: db.archiveSeasonAndActivateNext(archiveData) });
  });

  // ---------- viewers & testing ----------

  router.get("/viewer/:userId", (req, res) => {
    const viewer = db.getViewer(req.params.userId);
    if (!viewer) return res.status(404).json({ error: "Viewer not found" });
    res.json(viewer);
  });

  /** Fires a fake sort through the real pipeline so streamers can test the overlay. */
  router.post("/test-sort", (req, res) => {
    const faction = pickRandomFaction();
    if (!faction) return res.status(400).json({ error: "No factions configured" });
    const username = (req.body?.username as string) || "TestViewer";
    triggerOverlayUpdate(username, `test-${Date.now()}`, false, faction);
    res.json({ success: true, faction: faction.name });
  });

  // Restart EventSub manually (e.g. after fixing a connection problem).
  router.post("/eventsub/restart", (_req, res) => {
    stopEventSub();
    if (db.getStreamer()) startEventSub();
    res.json({ success: true });
  });

  return router;
}
