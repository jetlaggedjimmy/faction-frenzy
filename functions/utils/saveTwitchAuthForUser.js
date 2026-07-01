// utils/saveTwitchAuthForUser.js
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

async function saveTwitchAuthForUser(broadcasterId, {
  login,
  display_name,
  profile_image_url,
  access_token,
  refresh_token,
  linkedAt = Date.now()
}) {
  await db.collection("streamers").doc(broadcasterId).set({
    login,
    display_name,
    profile_image_url,
    access_token,
    refresh_token,
    linkedAt
  }, { merge: true });
  
  console.log(`✅ Stored tokens for ${display_name} (${broadcasterId})`);
}

module.exports = { saveTwitchAuthForUser };