// routes/twitchAuthRouter.js
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const crypto = require("crypto");
const { saveTwitchAuthForUser } = require("../utils/saveTwitchAuthForUser");

const router = express.Router();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

const SCOPES = [
  "channel:read:subscriptions",
  "channel:read:redemptions",
  "channel:manage:redemptions",
  "moderation:read"
];

router.get("/start", (req, res) => {
  const state = crypto.randomUUID(); // 🔐 You can persist this if needed
  const authUrl =
    `https://id.twitch.tv/oauth2/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${SCOPES.join(" ")}` +
    `&state=${state}`;

  res.redirect(authUrl);
});

router.get("/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code from Twitch");

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token } = tokenData;

    const userRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        "Client-ID": CLIENT_ID,
        Authorization: `Bearer ${access_token}`
      }
    });

    const userData = await userRes.json();
    const twitchUser = userData.data?.[0];

    if (!twitchUser) return res.status(500).send("Unable to fetch Twitch user");

    // 🗂️ Save this to your DB!
    console.log("🎉 Linked Twitch user:", {
      broadcaster_id: twitchUser.id,
      login: twitchUser.login,
      display_name: twitchUser.display_name,
      access_token,
      refresh_token
    });

    await saveTwitchAuthForUser(twitchUser.id, {
      login: twitchUser.login,
      display_name: twitchUser.display_name,
      profile_image_url: twitchUser.profile_image_url,
      access_token,
      refresh_token,
      linkedAt: Date.now()
    });

    res.redirect("/settings.html?user=" + twitchUser.id);
  } catch (err) {
    console.error("❌ Twitch OAuth failed:", err);
    res.status(500).send("OAuth failed");
  }
});

module.exports = router;