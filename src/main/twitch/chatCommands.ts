import * as db from "../db";
import { getUserByLogin, sendChatMessage } from "./helix";
import { getOrAssignFaction } from "../services/sorter";
import { triggerOverlayUpdate } from "../services/sorter";
import {
  awardPointsToUser, getFactionRankDetails, getUserRankInFaction, ordinal
} from "../services/points";

interface ChatMessageEvent {
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message: { text: string };
  badges?: { set_id: string }[];
}

function isModOrBroadcaster(event: ChatMessageEvent): boolean {
  return (event.badges ?? []).some((b) => b.set_id === "broadcaster" || b.set_id === "moderator");
}

/** Handles the ! chat commands (ported from the legacy bot + /chat/* endpoints). */
export async function handleChatCommand(event: ChatMessageEvent): Promise<void> {
  const text = event.message?.text?.trim() ?? "";
  if (!text.startsWith("!")) return;

  const [command, ...args] = text.split(/\s+/);
  const userId = event.chatter_user_id;
  const username = event.chatter_user_name;

  switch (command.toLowerCase()) {
    case "!jointhebattle": {
      const result = getOrAssignFaction(userId, username);
      if (!result) {
        await sendChatMessage(`@${username}, something went wrong trying to join a faction — try again soon`);
        return;
      }
      if (!result.isReturning) {
        triggerOverlayUpdate(username, userId, false, result.faction);
      } else {
        await sendChatMessage(`@${username}, you're already a proud member of ${result.faction.name}. 🛡️`);
      }
      return;
    }

    case "!myfaction": {
      const viewer = db.getViewer(userId);
      if (!viewer?.faction) {
        await sendChatMessage(
          `@${username}, you haven't joined a faction yet. Try subscribing or typing !jointhebattle to get started!`
        );
        return;
      }
      const { rank: factionRank, points: factionPoints } = getFactionRankDetails(viewer.faction);
      const { rank: userRank, points: userPoints } = getUserRankInFaction(viewer.faction, userId);

      const factionMsg = factionPoints > 0
        ? `ranked ${factionRank}${ordinal(factionRank)} with ${factionPoints} points 🏆`
        : "currently unranked — your house hasn't scored yet";
      const userMsg = userPoints > 0
        ? `you're ${userRank}${ordinal(userRank)} in your faction with ${userPoints} points`
        : "you haven't scored any points yet";

      await sendChatMessage(`@${username}, you're in ${viewer.faction}, ${factionMsg} — ${userMsg}!`);
      return;
    }

    case "!factionstandings": {
      const factions = [...db.getFactions()].sort((a, b) => b.points - a.points);
      if (factions.length === 0) {
        await sendChatMessage("No factions are configured yet.");
        return;
      }
      const standings = factions
        .map((f, i) => `${i + 1}. ${f.name} (${f.points})`)
        .join(" | ");
      await sendChatMessage(`🏆 Faction standings: ${standings}`);
      return;
    }

    case "!award": {
      if (!isModOrBroadcaster(event)) return;
      const [target, amountRaw] = args;
      const amount = Number(amountRaw);
      if (!target || !Number.isFinite(amount) || amount <= 0) {
        await sendChatMessage(`@${username}, usage: !award @user points`);
        return;
      }
      const login = target.replace(/^@/, "");
      let viewer = db.getViewerByLogin(login);
      if (!viewer) {
        // Fall back to Helix in case the display name differs from what we stored.
        const user = await getUserByLogin(login);
        if (user) viewer = db.getViewer(user.id);
      }
      if (!viewer?.faction) {
        await sendChatMessage(`@${username}, ${target} hasn't joined a faction yet.`);
        return;
      }
      await awardPointsToUser(viewer.userId, amount, "chat");
      return;
    }
  }
}
