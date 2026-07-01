const { getFirestore } = require("firebase-admin/firestore");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const db = getFirestore();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

async function getUserAccessToken(broadcasterId) {
  const doc = await db.collection("streamers").doc(broadcasterId).get();
  if (!doc.exists) throw new Error(`No token found for user ${broadcasterId}`);

  const { access_token, refresh_token } = doc.data();

  // Optional: validate token here via /oauth2/validate

  return access_token;
}

async function getAppAccessToken() {
  const qs = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials"
  });

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: qs
  });

  const data = await res.json();
  return data.access_token;
}

module.exports = { getUserAccessToken, getAppAccessToken };