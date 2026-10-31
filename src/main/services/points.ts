import * as db from "../db";
import { sendChatMessage } from "../twitch/helix";
import { broadcastLeaderboard } from "../server/hub";

export function ordinal(n: number): string {
  return ["st", "nd", "rd"][((n % 100 >> 3) ^ 1 && n % 10) - 1] || "th";
}

/**
 * Awards points to a sorted viewer and their faction, records the event,
 * announces it in chat and taunts when the faction lead changes.
 */
export async function awardPointsToUser(
  userId: string,
  points: number,
  source: string,
  options: { announce?: boolean } = {}
): Promise<boolean> {
  const viewer = db.getViewer(userId);
  if (!viewer?.faction) {
    console.warn(`User ${userId} is not sorted — no points awarded`);
    return false;
  }

  db.addViewerPoints(userId, points);
  db.addFactionPoints(viewer.faction, points);
  db.recordPointEvent(userId, viewer.username, viewer.faction, points, source);
  console.log(`✅ Awarded ${points} points to ${viewer.username} (${viewer.faction})`);

  if (options.announce !== false) {
    await sendChatMessage(`✅ Awarded ${points} points to ${viewer.username} (${viewer.faction})`);
  }

  const factions = db.getFactions();
  broadcastLeaderboard(factions);

  // Taunt when a new faction takes the lead
  if (factions.length > 0) {
    const top = factions.reduce((a, b) => (b.points > a.points ? b : a));
    const lastLeader = db.getState("lastKnownLeader");
    if (lastLeader !== top.name) {
      db.setState("lastKnownLeader", top.name);
      const taunts = [
        `${top.name} takes the lead! The arena just got interesting.`,
        `🔥 New faction on top: ${top.name}. Who's coming for them?`,
        `${top.name} just made a move. Time to rally, rivals!`
      ];
      await sendChatMessage(taunts[Math.floor(Math.random() * taunts.length)]);
    }
  }
  return true;
}

export function getFactionRankDetails(factionName: string): { rank: number; points: number } {
  const sorted = [...db.getFactions()].sort((a, b) => b.points - a.points);
  const index = sorted.findIndex((f) => f.name.toLowerCase() === factionName.toLowerCase());
  return { rank: index + 1, points: sorted[index]?.points ?? 0 };
}

export function getUserRankInFaction(factionName: string, userId: string): { rank: number; points: number } {
  const members = db.getFactionMembersRanked(factionName);
  const index = members.findIndex((m) => m.userId === userId);
  return { rank: index + 1, points: members[index]?.points ?? 0 };
}

/** Points for a (re)subscription of the given tier; Prime gets a loyalty bonus. */
export function pointsForSub(tier: string): number {
  if (tier.toLowerCase() === "prime") return 75;
  const tierInt = parseInt(tier, 10);
  const multiplier = Number.isNaN(tierInt) ? 1 : tierInt / 1000;
  return 50 * multiplier;
}

/** Points for gifting `count` subs of the given tier. */
export function pointsForGift(tier: string, count: number): number {
  const tierInt = parseInt(tier, 10);
  const multiplier = Number.isNaN(tierInt) ? 1 : tierInt / 1000;
  return 50 * count * multiplier;
}
