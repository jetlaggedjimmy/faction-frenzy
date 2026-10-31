import * as db from "../db";
import type { Faction } from "../../shared/types";
import { enqueueSort } from "../server/hub";

export function pickRandomFaction(): Faction | null {
  const factions = db.getFactions();
  if (factions.length === 0) return null;
  return factions[Math.floor(Math.random() * factions.length)];
}

/** Assigns a (new) random faction to the viewer, preserving their points. */
export function assignRandomFaction(userId: string, username: string): Faction | null {
  const faction = pickRandomFaction();
  if (!faction) {
    console.warn("No factions configured — cannot sort", username);
    return null;
  }
  db.saveViewerFaction(userId, username, faction.name);
  console.log(`🧭 Assigned ${username} to faction: ${faction.name}`);
  return faction;
}

export interface SortResult {
  faction: Faction;
  isReturning: boolean;
}

/** Returns the viewer's current faction, or assigns a random one. */
export function getOrAssignFaction(userId: string, username: string): SortResult | null {
  const viewer = db.getViewer(userId);
  if (viewer?.faction) {
    const faction = db.getFactions().find((f) => f.name.toLowerCase() === viewer.faction.toLowerCase());
    if (faction) return { faction, isReturning: true };
  }
  const assigned = assignRandomFaction(userId, username);
  return assigned ? { faction: assigned, isReturning: false } : null;
}

export function hasSortedFaction(userId: string): boolean {
  return !!db.getViewer(userId)?.faction;
}

/** Queues the sorting reveal animation on the overlay (or announces directly). */
export function triggerOverlayUpdate(username: string, userId: string, isReturning: boolean, faction: Faction): void {
  enqueueSort({ username, userId, faction: faction.name, factionColor: faction.color, isReturning });
}
