require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
app.use(cors({
  origin: "https://factionfrenzy.gg",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

const { db, getFactions, setFactions, getPresetThemes, getPresetThemeById, getCustomThemeById, getOverlaySettings, saveOverlaySettings, resetOverlaySettings, sendMessageToChat, joinChannel, hasSortedFaction, getOrAssignFaction, getSortedViewer, getStreamerMeta, getFactionRankDetails, getUserRankInFaction, ordinal, awardPointsToUser, triggerOverlayUpdate, getChannelName, saveCurrentSeason, saveNextSeason, getSeasonState, archiveSeasonAndActivateNext, saveCustomTheme, getCustomThemes, getStreamerDetails } = require("./firebaseHelper");
const { resolveUserIdFromUsername } = require("./utils/resolveUserId");
const { subscribeToTwitchEvents } = require("./utils/subscribeToTwitchEvents");
const twitchAuthRouter = require("./routes/twitchAuthRouter");
app.use("/auth/twitch", twitchAuthRouter);
const { getUserAccessToken } = require("./utils/twitchOAuth");


const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_CALLBACK_URL = process.env.TWITCH_CALLBACK_URL;

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require("dotenv").config();

// Other middleware (optional)
app.use(express.json());

app.get("/lookup-user", async (req, res) => {
  const { handle } = req.query;
  if (!handle) return res.status(400).send({ error: "Missing handle" });

  try {
    const token = await getUserAccessToken();

    const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${handle}`, {
      headers: {
        "Client-ID": process.env.TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await twitchRes.json();
    if (!twitchRes.ok) throw new Error(data.message || "Twitch API error");

    res.send(data.data[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: err.message });
  }
});

app.post("/saveTheme", async (req, res) => {
  const { broadcasterId, factions, channelName } = req.body;

  if (!broadcasterId || !factions || !channelName) {
    return res.status(400).json({ error: "Missing broadcaster ID, factions or channelName" });
  }

  try {
    await setFactions(broadcasterId, factions, channelName);
    await subscribeToTwitchEvents(broadcasterId, channelName, [
      "channel.subscribe",               // 🔄 New subscriptions
      "channel.subscription.gift",       // 🎁 Gifted subs
      "channel.subscription.message",    // 💬 Resub message (like "X months!")
      "channel.channel_points_custom_reward_redemption.add"
    ]);

    const result = await joinChannel(channelName, broadcasterId);

    console.log("✅ Saved theme with preserved points for:", broadcasterId);
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Firestore error in /saveTheme:", error);
    res.status(500).json({ error: "Failed to save theme." });
  }
});

app.get("/getTheme", async (req, res) => {
  const { broadcasterId } = req.query;
  if (!broadcasterId) {
    return res.status(400).json({ error: "Missing broadcasterId" });
  }

  try {
    const factions = await getFactions(broadcasterId);
    res.json({ factions });
  } catch (err) {
    console.error("🔥 Error fetching factions:", err);
    res.status(500).json({ error: "Failed to fetch factions" });
  }
});

app.get("/getStreamerProfile", async (req, res) => {
  const { streamerId } = req.query;
  if (!streamerId) return res.status(400).json({ error: "Missing streamerId" });

  try {
    const profile = await getStreamerDetails(streamerId);

    res.json(profile);
  } catch (err) {
    console.error("❌ Failed to fetch streamer profile:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/getThemes", async (req, res) => {
  try {
    const themes = await getPresetThemes();
    res.json({ themes });
  } catch (error) {
    console.error("🔥 Error fetching themes:", error);
    res.status(500).json({ error: "Failed to fetch themes" });
  }
});

app.get("/getThemeDetails", async (req, res) => {
  const { streamerId, themeId } = req.query;

  try {
    // 🗂️ First check presets
    const presetTheme = await getPresetThemeById(themeId);
    if (presetTheme) return res.json(presetTheme);

    // 🛠️ Then fallback to custom themes
    const customTheme = await getCustomThemeById(streamerId, themeId);
    if (customTheme) return res.json(customTheme);

    return res.status(404).json({ error: "Theme not found" });
  } catch (err) {
    console.error("❌ Failed to fetch theme details:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/assignRandomFaction", async (req, res) => {
  const { streamerId, username, userId } = req.body;

  const faction = await assignRandomFaction(streamerId, userId, username);

  if (!faction) {
    console.error(`Failed to assign faction for ${username}`);
    return res.status(500).json({ error: "Assignment failed" });
  }

  console.log(`${username} assigned to ${faction.name}`);
  res.json({ faction }); // 👈 return assigned faction to bot
});


 // ✅ Add this at the top

app.post("/eventsub", async (req, res) => {
  const messageType = req.headers["twitch-eventsub-message-type"];

  if (messageType === "webhook_callback_verification") {
    console.log("Handling Twitch webhook verification...");
    return res.status(200).send(req.body.challenge);
  }

  // Signature validation (safe for local test with fake-signature)
  const signature = req.headers["twitch-eventsub-message-signature"];
  if (signature === "fake-signature") {
    console.log("Bypassing signature check for local test.");
  } else {
    const crypto = require("crypto");
    const TWITCH_SECRET_KEY = process.env.TWITCH_SECRET_KEY;
    const messageID = req.headers["twitch-eventsub-message-id"];
    const timestamp = req.headers["twitch-eventsub-message-timestamp"];
    const hmacMessage = messageID + timestamp + JSON.stringify(req.body);
    const computedHmac = `sha256=${crypto.createHmac("sha256", TWITCH_SECRET_KEY).update(hmacMessage).digest("hex")}`;
    if (computedHmac !== signature) {
      console.error("Signature mismatch! Possible unauthorized request.");
      return res.sendStatus(403);
    }
  }

  // Process the subscription event
  const event = req.body.event;
  if (!event?.user_name || !event?.user_id) {
    console.warn("Event payload missing required fields");
    return res.sendStatus(400);
  }


  const broadcasterId = event.broadcaster_user_id || req.body.condition?.broadcaster_user_id;
  const channelName = event.broadcaster_user_login;
  const userId = event.user_id;
  const username = event.user_name;
  const subType = req.body.subscription?.type;

  
  if (subType === "channel.channel_points_custom_reward_redemption.add") {
    const { user_name, user_input, reward } = event;

    // ⬇️ Example: trigger slot spin
    if (reward.title === "Respin Faction Slot") {
      const hasFaction = await hasSortedFaction(broadcasterId, userId);
      if (!hasFaction) {
        await rejectRedemption(redemptionId); // Optional: mark as denied
        return;
      }
      const { faction } = await assignRandomFaction(broadcasterId, userId, username);
      await triggerOverlayUpdate(broadcasterId, username, userId, false, faction);
    }
  }

  if (subType === "channel.follow") {
    const { faction, isReturning } = await getOrAssignFaction(broadcasterId, userId, username);
    await triggerOverlayUpdate(broadcasterId, username, userId, isReturning, faction);
    return res.sendStatus(200);
  } else if (subType === "channel.subscription.gift") {
    // 🎁 Gifter logic
    const gifterId = event.user_id;
    const giftedTier = event.tier || "1000";
    const giftedCount = event.total || 1;

    const hasFaction = await hasSortedFaction(broadcasterId, gifterId);
    if (hasFaction) {
      const giftTierMultiplier = parseInt(giftedTier) / 1000;
      const points = 50 * giftedCount * giftTierMultiplier;
      await awardPointsToUser(broadcasterId, channelName, gifterId, points, "gifted_subs");
      console.log(`💎 ${points} points awarded to gifter ${username} (Tier ${giftedTier})`);
    }
  } else if (subType === "channel.subscribe" && event.is_gift) {
    // 🧑‍🎓 Gift sub recipient
    const { faction, isReturning } = await getOrAssignFaction(broadcasterId, userId, username);
    await triggerOverlayUpdate(broadcasterId, username, userId, isReturning, faction);
    console.log(`🎁 Gift recipient ${username} sorted into a faction`);
  } else if (subType === "channel.subscription.message" || subType === "channel.subscribe") {
    // Prime or tier logic
    const { faction, isReturning } = await getOrAssignFaction(broadcasterId, userId, username);

    const subTier = event.tier || "1000";
    let points;

    if (subTier.toLowerCase() === "prime") {
      points = 75; // 🎁 Bonus for Prime support!
      console.log(`👑 Prime sub detected — bonus awarded to ${username}`);
    } else {
      const tierInt = parseInt(subTier);
      const subTierMultiplier = isNaN(tierInt) ? 1 : tierInt / 1000;
      points = 50 * subTierMultiplier;
    }
    await awardPointsToUser(broadcasterId, channelName, userId, points, "subscription");
    await triggerOverlayUpdate(broadcasterId, username, userId, isReturning, faction);
    console.log(`🔥 ${points} points awarded to ${username} (Tier: ${subTier})`);
  }

  res.sendStatus(200);
});

app.post("/overlayComplete", async (req, res) => {
  const { broadcasterId, userId, username, faction, isReturning } = req.body;
  const channelName = await getChannelName(broadcasterId); // Or pass it from overlay

  const msg = isReturning
      ? `@${username}, you're already a proud member of ${faction}. 🛡️`
      : `🛡️ @${username} has joined ${faction}! The battle begins now! ⚔️`;

  await sendMessageToChat(channelName, broadcasterId, msg);

  res.sendStatus(200);
});

app.get("/getViewer", async (req, res) => {
  const { streamerId, userId } = req.query;
  if (!streamerId || !userId) {
    return res.status(400).json({ error: "Missing streamerId or userId" });
  }

  try {
    const subData = await getSortedViewer(streamerId, userId);
    if (!subData) {
      return res.status(404).json({ error: "Viewer not found" });
    }
    res.json(subData);
  } catch (err) {
    console.error("Error fetching subscriber:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET overlay settings
app.get("/getOverlaySettings", async (req, res) => {
  const { streamerId, overlay } = req.query;
  if (!streamerId || !overlay) return res.status(400).json({ error: "Missing streamerId" });

  try {
    const settings = await getOverlaySettings(streamerId, overlay);
    res.json({ settings });
  } catch (err) {
    console.error("Failed to get settings:", err);
    res.status(500).json({ error: "Error fetching overlay settings" });
  }
});

// POST or PUT overlay settings
app.post("/saveOverlaySettings", async (req, res) => {
  const { streamerId, overlay, settings } = req.body;
  if (!streamerId || !overlay || typeof settings !== "object") {
    return res.status(400).json({ error: "Missing or malformed payload" });
  }
  console.log("Received settings:", req.body.settings);
  try {
    await saveOverlaySettings(streamerId, overlay, settings);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to save settings:", err);
    res.status(500).json({ error: "Error saving overlay settings" });
  }
});

// POST or PUT overlay settings
app.post("/resetOverlaySettings", async (req, res) => {
  const { streamerId, overlay } = req.body;
  if (!streamerId || !overlay) {
    return res.status(400).json({ error: "Missing or malformed payload" });
  }
  try {
    await resetOverlaySettings(streamerId, overlay);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to reset settings:", err);
    res.status(500).json({ error: "Error resetting overlay settings" });
  }
});

app.get("/getStreamerMeta", async (req, res) => {
  const { broadcasterId } = req.query;
  if (!broadcasterId) return res.status(400).send({ error: "Missing broadcasterId" });

  const meta = await getStreamerMeta(broadcasterId);
  if (!meta) return res.status(404).send({ error: "Broadcaster not found" });

  const { login, display_name, profile_image_url } = meta;
  res.json({ login, display_name, profile_image_url });
});

app.post("/chat/myfaction", async (req, res) => {
  const { streamerId, userId, username, channelName } = req.body;

  try {
    const subData = await getSortedViewer(streamerId, userId);

    if (!subData?.faction) {
      const msg = `@${username}, you haven’t joined a faction yet. Try subscribing or typing !jointhebattle to get started!`;
      await sendMessageToChat(channelName, streamerId, msg);
      return res.sendStatus(200);
    }

    const { rank: factionRank, points: factionPoints } = await getFactionRankDetails(streamerId, subData.faction);
    const { rank: userRank, points: userPoints } = await getUserRankInFaction(streamerId, subData.faction, userId);

    let factionMsg = `ranked ${factionRank}${ordinal(factionRank)} with ${factionPoints} points 🏆`;
    let userMsg = `you're ${userRank}${ordinal(userRank)} in your faction with ${userPoints} points`;

    if (!factionPoints || factionPoints === 0) {
      factionMsg = `currently unranked — your house hasn’t scored yet`;
    }

    if (!userPoints || userPoints === 0) {
      userMsg = `you haven’t scored any points yet`;
    }

    const msg = `@${username}, you're in ${subData.faction}, ${factionMsg} — ${userMsg}!`;
    
    await sendMessageToChat(channelName, streamerId, msg);
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error in /chat/myfaction:", err);
    const channelName = channelName;
    const fallback = `@${username}, I couldn’t retrieve your faction info right now. Try again soon!`;
    await sendMessageToChat(channelName, streamerId, fallback);
    res.sendStatus(500);
  }
});

app.post("/chat/award", async (req, res) => {
  const { streamerId, channelName, userId, points, source = "chat" } = req.body;
  if (!streamerId || !userId || !points) {
    return res.status(400).json({ error: "Missing streamerId, userId, or points" });
  }

  try {
    await awardPointsToUser(streamerId, channelName, userId, points, source);
    res.status(200).json({ success: true, taunt: typeof taunt === "string" ? taunt : null });
  } catch (error) {
    console.error("❌ Error awarding points:", error.message);
    res.status(500).json({ error: "Failed to award points." });
  }
});

app.post("/chat/jointhebattle", async (req, res) => {
  const { streamerId, userId, username, channelName } = req.body;

  try {
    const { faction, isReturning } = await getOrAssignFaction(streamerId, userId, username);

    if (!faction) {
      const msg = `@${username}, something went wrong trying to join a faction — try again soon`;
      await sendMessageToChat(channelName, streamerId, msg);
      return res.sendStatus(500);
    }

    if (!isReturning) { 
      await triggerOverlayUpdate(streamerId, username, userId, isReturning, faction) 
    } else {
      await sendMessageToChat(channelName, streamerId, `@${username}, you're already a proud member of ${faction}. 🛡️`);
    }
    res.sendStatus(200);

  } catch (err) {
    console.error("❌ Error in /chat/jointhebattle:", err.message);
    const fallback = `@${username}, there was an issue assigning your faction. Try again soon.`;
    await sendMessageToChat(channelName, streamerId, fallback);
    res.sendStatus(500);
  }
});

app.post("/saveCurrentSeason", async (req, res) => {
  const { broadcasterId, season } = req.body;
  if (!broadcasterId || !season) {
    return res.status(400).json({ error: "Missing broadcasterId or season data" });
  }

  try {
    await saveCurrentSeason(broadcasterId, season);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 Error saving current season:", err);
    res.status(500).json({ error: "Failed to save current season" });
  }
});

app.post("/saveNextSeason", async (req, res) => {
  const { broadcasterId, season } = req.body;
  if (!broadcasterId || !season) {
    return res.status(400).json({ error: "Missing broadcasterId or season data" });
  }

  try {
    await saveNextSeason(broadcasterId, season);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 Error saving next season:", err);
    res.status(500).json({ error: "Failed to save next season" });
  }
});

app.get("/getSeasons", async (req, res) => {
  const { broadcasterId } = req.query;
  if (!broadcasterId) {
    return res.status(400).json({ error: "Missing broadcasterId" });
  }

  try {
    const data = await getSeasonState(broadcasterId);
    res.json(data);
  } catch (err) {
    console.error("🔥 Error loading seasons:", err);
    res.status(500).json({ error: "Failed to load season state" });
  }
});

app.post("/archiveAndPromoteSeason", async (req, res) => {
  const { broadcasterId, archiveData } = req.body;
  if (!broadcasterId || !archiveData) {
    return res.status(400).json({ error: "Missing broadcasterId or archiveData" });
  }

  try {
    const success = await archiveSeasonAndActivateNext(broadcasterId, archiveData);
    res.json({ promoted: success });
  } catch (err) {
    console.error("🔥 Error transitioning season:", err);
    res.status(500).json({ error: "Failed to archive and promote season" });
  }
});

app.post("/saveCustomTheme", async (req, res) => {
  const { broadcasterId, themeName, factions } = req.body;
  try {
    const newId = await saveCustomTheme(broadcasterId, themeName, factions);
    res.json({ success: true, themeId: newId });
  } catch (err) {
    console.error("🔥 Failed to save custom theme:", err);
    res.status(500).json({ error: err.message || "Failed to save custom theme" });
  }
});

app.get("/getCustomThemes", async (req, res) => {
  const streamerId = req.query.streamerId;
  try {
    const themes = await getCustomThemes(streamerId);
    res.json({ themes });
  } catch (err) {
    console.error("Error fetching custom themes:", err);
    res.status(500).json({ error: "Could not retrieve custom themes" });
  }
});

module.exports = app;