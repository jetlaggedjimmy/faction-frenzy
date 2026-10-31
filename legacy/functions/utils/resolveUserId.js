const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getUserAccessToken } = require("./twitchOAuth");

async function resolveUserIdFromUsername(username) {
  const token = await getUserAccessToken();
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: {
      "Client-ID": process.env.TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${token}`
    }
  });
  const data = await res.json();
  return data?.data?.[0]?.id || null;
}

module.exports = { resolveUserIdFromUsername };