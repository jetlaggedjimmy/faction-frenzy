const dotenv = require("dotenv");
dotenv.config();

const axios = require("axios");
const { getUserAccessToken, getAppAccessToken } = require("./twitchOAuth");

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET_KEY = process.env.TWITCH_SECRET_KEY;
const CALLBACK_URL = process.env.API_URL + "/eventsub";

/**
 * Subscribe to one or more Twitch EventSub events for a given broadcaster.
 * This function removes any existing conflicting subscriptions before creating fresh ones.
 *
 * @param {string} broadcasterId
 * @param {string} channelName
 * @param {string[]} eventTypes (e.g. ["channel.subscribe", "channel.follow"])
 */
async function subscribeToTwitchEvents(broadcasterId, channelName, eventTypes = ["channel.subscription"]) {
  const APP_TOKEN = await getAppAccessToken(); // ✅ scoped to the streamer
  if (!APP_TOKEN) {
    console.error("❌ Missing app access token");
    return;
  }

  try {
    const { data } = await axios.get("https://api.twitch.tv/helix/eventsub/subscriptions", {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${APP_TOKEN}`,
      },
    });

    const existingSubs = data.data;

    const versionMap = {
      "channel.subscribe": "1",
      "channel.subscription.gift": "1",
      "channel.subscription.message": "1",
      "channel.subscription.end": "1",
      "channel.follow": "2",
      "channel.channel_points_custom_reward_redemption.add": "1"
    };
    console.log("📦 Subscribing to event types:", eventTypes);
    for (const type of eventTypes) {
      const version = versionMap[type];
      if (!version) {
        console.warn(`⚠️ Skipping unknown EventSub type: ${type}`);
        continue;
      }

      // 👇 Dynamic condition based on event type
      const condition = type === "channel.follow"
        ? {
            broadcaster_user_id: broadcasterId,
            moderator_user_id: broadcasterId
          }
        : {
            broadcaster_user_id: broadcasterId
        };

      const tokenToUse = type === "channel.follow"
        ? await getUserAccessToken(broadcasterId)
        : APP_TOKEN;

      // Delete existing subs
      const duplicateSubs = existingSubs.filter(
        sub =>
          sub.type === type &&
          sub.condition?.broadcaster_user_id === broadcasterId
      );

      for (const dup of duplicateSubs) {
        await axios.delete(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${dup.id}`, {
          headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${tokenToUse}`
          }
        });
        console.log(`🧹 Deleted existing ${type} subscription (${dup.id}) for @${channelName}`);
      }

      // Log and subscribe
      console.log("🚀 Subscription payload:", {
        type,
        version,
        condition,
        transport: {
          method: "webhook",
          callback: CALLBACK_URL
        }
      });

      await axios.post(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          type,
          version,
          condition,
          transport: {
            method: "webhook",
            callback: CALLBACK_URL,
            secret: TWITCH_SECRET_KEY,
          },
        },
        {
          headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${tokenToUse}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ Subscribed to ${type} for @${channelName}`);
    }
  } catch (err) {
    console.error("🔥 Failed to subscribe:", err.response?.data || err.message);
  }
}

module.exports = { subscribeToTwitchEvents };