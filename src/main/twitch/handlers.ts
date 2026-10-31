import * as db from "../db";
import { sendChatMessage } from "./helix";
import {
  assignRandomFaction, getOrAssignFaction, hasSortedFaction, triggerOverlayUpdate
} from "../services/sorter";
import { awardPointsToUser, pointsForGift, pointsForSub } from "../services/points";
import { handleChatCommand } from "./chatCommands";

const DEFAULT_RESPIN_REWARD = "Respin Faction Slot";

export function getRespinRewardTitle(): string {
  return db.getState("respinRewardTitle") ?? DEFAULT_RESPIN_REWARD;
}

/** Routes EventSub notifications to game logic (ported from the legacy /eventsub webhook). */
export async function handleEvent(type: string, event: any): Promise<void> {
  switch (type) {
    case "channel.chat.message":
      await handleChatCommand(event);
      return;

    case "channel.channel_points_custom_reward_redemption.add": {
      if (event.reward?.title !== getRespinRewardTitle()) return;
      const { user_id: userId, user_name: username } = event;
      if (!hasSortedFaction(userId)) {
        await sendChatMessage(`@${username}, you need to join a faction before you can respin! Try !jointhebattle`);
        return;
      }
      const faction = assignRandomFaction(userId, username);
      if (faction) triggerOverlayUpdate(username, userId, false, faction);
      return;
    }

    case "channel.subscription.gift": {
      // Award the gifter; anonymous gifts earn nobody points.
      if (event.is_anonymous) return;
      const gifterId = event.user_id;
      if (!hasSortedFaction(gifterId)) return;
      const points = pointsForGift(event.tier ?? "1000", event.total ?? 1);
      await awardPointsToUser(gifterId, points, "gifted_subs");
      console.log(`💎 ${points} points awarded to gifter ${event.user_name}`);
      return;
    }

    case "channel.subscribe": {
      const { user_id: userId, user_name: username } = event;
      const result = getOrAssignFaction(userId, username);
      if (!result) return;

      if (event.is_gift) {
        // Gift recipients get sorted but no points.
        triggerOverlayUpdate(username, userId, result.isReturning, result.faction);
        console.log(`🎁 Gift recipient ${username} sorted into ${result.faction.name}`);
        return;
      }

      const points = pointsForSub(event.tier ?? "1000");
      await awardPointsToUser(userId, points, "subscription", { announce: false });
      triggerOverlayUpdate(username, userId, result.isReturning, result.faction);
      console.log(`🔥 ${points} points awarded to ${username} (Tier: ${event.tier})`);
      return;
    }

    case "channel.subscription.message": {
      // Resub with a share message.
      const { user_id: userId, user_name: username } = event;
      const result = getOrAssignFaction(userId, username);
      if (!result) return;
      const points = pointsForSub(event.tier ?? "1000");
      await awardPointsToUser(userId, points, "subscription", { announce: false });
      triggerOverlayUpdate(username, userId, result.isReturning, result.faction);
      console.log(`🔥 ${points} points awarded to ${username} (resub, Tier: ${event.tier})`);
      return;
    }
  }
}
