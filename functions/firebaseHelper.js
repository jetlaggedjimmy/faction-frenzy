const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./firebase-service-account.json"))
  });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

async function saveViewer(broadcasterId, userId, username, faction) {
  try {
      const docRef = db.collection(`streamers/${broadcasterId}/viewers`).doc(userId);
      await docRef.set({
          userId,
          username,
          faction,
          points: 0,
          sortedAt: new Date()
      });
      console.log(`${username} sorted into ${faction} under broadcaster ${broadcasterId}`);
  } catch (err) {
      console.error("Error saving subscriber:", err.message);
  }
}

async function getStreamerDetails(broadcasterId) {
  const ref = db.collection("streamers").doc(broadcasterId);
  const snap = await ref.get();

  if (!snap.exists) return res.status(404).json({ error: "Streamer not found" });

  const data = snap.data();

  // Return only safe public-facing fields
  const profile = {
    displayName: data.display_name || data.channelName || data.login,
    profileImageUrl: data.profile_image_url
  };
  return profile;
}

async function getSortedViewer(broadcasterId, userId) {
  const docRef = db.collection(`streamers/${broadcasterId}/viewers`).doc(userId);
  const snapshot = await docRef.get();
  return snapshot.exists ? snapshot.data() : null;
}

async function getFactions(broadcasterId) {
  const docSnap = await db.collection("streamers").doc(broadcasterId).get();
  if (!docSnap.exists) return [];

  return docSnap.data().factions || [];
}

async function setFactions(broadcasterId, factions, channelName) {
  const ref = db.collection("streamers").doc(broadcasterId);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : {};

  const existingPoints = {};
  (existing.factions || []).forEach(f => {
    if (f?.name && typeof f.points === "number") {
      existingPoints[f.name] = f.points;
    }
  });

  const enrichedFactions = factions.map(f => ({
    ...f,
    points: existingPoints[f.name] ?? 0
  }));

  await ref.set({
    factions: enrichedFactions,
    channelName: channelName.toLowerCase(),
    updatedAt: Date.now()
  },
  { merge: true });
}

async function saveCustomTheme(broadcasterId, themeName, factions, sourcePresetId = null) {
  if (!themeName || !Array.isArray(factions) || factions.length === 0) {
    throw new Error("Invalid custom theme payload");
  }
  const profile = getStreamerDetails(broadcasterId);
  const ref = db.collection(`streamers/${broadcasterId}/customThemes`);
  const payload = {
    name: themeName.trim(),
    factions,
    logo: profile.profileImageUrl,
    createdAt: new Date(),
    sourcePresetId: sourcePresetId || null
  };

  const savedDoc = await ref.add(payload);
  return savedDoc.id; // 👈 useful for assigning to season.theme later
}

async function getCustomThemes(streamerId) {
  if (!streamerId) throw new Error("Missing streamer ID");

  const snapshot = await db
    .collection(`streamers/${streamerId}/customThemes`)
    .orderBy("createdAt", "desc")
    .get();

  const themes = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return themes;
}

async function getPresetThemes() {
  const snap = await db.collection("presets").get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function triggerOverlayUpdate(broadcasterId, username, userId, isReturning, faction) {
  const ref = db.collection(`streamers/${broadcasterId}/queue`);
  await ref.add({
    username,
    userId,
    isReturning,
    faction,
    timestamp: Date.now()
  });
}

async function getPresetThemeById(themeId) {
  const doc = await db.collection("presets").doc(themeId).get();
  if (!doc.exists) return null;
  return doc.data();
}

async function getCustomThemeById(streamerId, themeId) {
  const doc = await db.collection(`streamers/${streamerId}/customThemes`).doc(themeId).get();
  if (!doc.exists) return null;
  return doc.data();
}

async function awardPointsToUser(broadcasterId, channelName, userId, pointsToAward, sourceType = "manual_award") {
  if (!broadcasterId || !userId || typeof pointsToAward !== "number") {
    throw new Error("Invalid arguments to awardPointsToUser");
  }

  const userRef = db.collection(`streamers/${broadcasterId}/viewers`).doc(userId);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    console.warn(`User ${userId} not found for streamer ${broadcasterId}`);
    return;
  }

  const userData = userSnap.data();
  const currentFaction = userData.faction?.trim().toLowerCase();
  if (!currentFaction) {
    console.warn(`User ${userId} has no assigned faction`);
    return;
  }

  // Increment personal score
  await userRef.update({
    points: FieldValue.increment(pointsToAward)
  });

  // Update faction score
  const streamerRef = db.collection("streamers").doc(broadcasterId);
  const streamerSnap = await streamerRef.get();
  if (!streamerSnap.exists) return;

  const currentFactions = streamerSnap.data().factions || [];
  const updatedFactions = currentFactions.map(cat => {
    const name = cat.name?.trim().toLowerCase();
    return name === currentFaction
      ? { ...cat, points: (cat.points || 0) + pointsToAward }
      : cat;
  });

  await streamerRef.update({ factions: updatedFactions });

  // Record event
  const eventsRef = db.collection(`streamers/${broadcasterId}/pointEvents`);
  await eventsRef.add({
    username: userData.username,
    userId,
    faction: currentFaction,
    amount: pointsToAward,
    type: sourceType,
    timestamp: Date.now()
  });
  await sendMessageToChat(channelName, broadcasterId, `✅ Awarded ${pointsToAward} points to ${userData.username} (${currentFaction})`);
  console.log(`✅ Awarded ${pointsToAward} points to ${userData.username} (${currentFaction})`);

  // 🔥 Check for new leader
  const top = updatedFactions.reduce((a, b) => (b.points > a.points ? b : a));
  const lastLeader = streamerSnap.data().lastKnownLeader;

  if (lastLeader !== top.name) {
    await streamerRef.update({ lastKnownLeader: top.name });

    const taunts = [
      `${top.name} takes the lead! The arena just got interesting.`,
      `🔥 New faction on top: ${top.name}. Who’s coming for them?`,
      `${top.name} just made a move. Time to rally, rivals!`
    ];
    const taunt = taunts[Math.floor(Math.random() * taunts.length)];
    console.log(`🧙‍♂️ Selected taunt: ${taunt}`);
    await sendMessageToChat(channelName, broadcasterId, taunt);
  }
}

async function sendMessageToChat(channelName, broadcasterId, message) {
  const botUrl = "https://sorting-hat-bot-346342358760.us-central1.run.app";
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(botUrl);

  const result = await client.request({
    url: `${botUrl}/say`,
    headers: { "Content-Type": "application/json" },
    method: "POST",
    data: { channel: channelName, broadcasterId: broadcasterId, message: message }
  });
}

async function joinChannel (channelName, broadcasterId) {
  const botUrl = "https://sorting-hat-bot-346342358760.us-central1.run.app";
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(botUrl);

  const result = await client.request({
    url: `${botUrl}/join-channel`,
    headers: { "Content-Type": "application/json" },
    method: "POST",
    data: { channelName: channelName }
  });
  const msg = `FactionFrenzy is now enabled in your channel. ⚔️ Let the battle begin!`;
  await sendMessageToChat(channelName, broadcasterId, msg);
  return result;
}

async function getOverlaySettings(streamerId, overlay) {
  const ref = db.collection("streamers").doc(streamerId);
  const snap = await ref.get();
  if (!snap.exists) return [];
  if (overlay == `sorter`) {
    return (snap.data().sorterOverlaySettings || []);
  }
  if (overlay == `leaderboard`) {
    return (snap.data().leaderboardOverlaySettings || []);
  }
  return (snap.data().overlaySettings || []);
}


async function saveOverlaySettings(streamerId, overlay, settings) {
  const ref = db.doc(`streamers/${streamerId}`);
  console.log("Received settings:", settings);
  if (overlay == `sorter`) {
    await ref.set({ sorterOverlaySettings: settings }, { merge: true });
  }
  if (overlay == `leaderboard`) {
    await ref.set({ leaderboardOverlaySettings: settings }, { merge: true });
  }
}

async function resetOverlaySettings(streamerId, overlay) {
  const ref = db.doc(`streamers/${streamerId}`);
  if (overlay == `sorter`) {
    await ref.update({
      sorterOverlaySettings: FieldValue.delete()
    });
  }
  if (overlay == `leaderboard`) {
    await ref.update({
      leaderboardOverlaySettings: FieldValue.delete()
    });
  }
}

async function hasSortedFaction(broadcasterId, userId) {
  const user = await getSortedViewer(broadcasterId, userId);
  return !!user?.faction;
}

async function assignRandomFaction(streamerId, userId, username) {
  const userRef = db.collection(`streamers/${streamerId}/viewers`).doc(userId);
  const streamerRef = db.collection("streamers").doc(streamerId);
  const streamerSnap = await streamerRef.get();

  if (!streamerSnap.exists) {
    console.warn(`Streamer ${streamerId} not found.`);
    return null;
  }

  const factions = streamerSnap.data().factions || [];
  if (factions.length === 0) {
    console.warn(`No factions found for streamer ${streamerId}`);
    return null;
  }

  const randomFaction = factions[Math.floor(Math.random() * factions.length)];
  const assignedName = randomFaction.name;

  await userRef.set(
    {
      faction: assignedName,
      username: username,
      userId: userId,
      points: 0
    },
    { merge: true }
  );

  console.log(`🧭 Assigned ${username} to faction: ${assignedName}`);
  return assignedName;
}

async function getOrAssignFaction(streamerId, userId, username) {
  const user = await getSortedViewer(streamerId, userId);
  const currentFaction = user?.faction || null;
  if (!currentFaction) {
    const newFaction = await assignRandomFaction(streamerId, userId, username);
    return { faction: newFaction, isReturning: false };
  }
  return { faction: currentFaction, isReturning: true };
}

async function getStreamerMeta(broadcasterId) {
  const doc = await db.collection("streamers").doc(broadcasterId).get();
  if (!doc.exists) return null;
  return doc.data();
}

async function getFactionRankDetails(streamerId, factionName) {
  const factions = await getFactions(streamerId);
  const sorted = [...factions].sort((a, b) => b.points - a.points);
  const index = sorted.findIndex(f => f.name === factionName);
  const points = sorted[index]?.points ?? 0;
  const position = index + 1;
  return { rank: position, points };
}

async function getUserRankInFaction(streamerId, factionName, userId) {
  const snap = await db
    .collection(`streamers/${streamerId}/viewers`)
    .where("faction", "==", factionName)
    .orderBy("points", "desc")
    .get();

  const members = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const index = members.findIndex(m => m.userId === userId);
  const points = members[index]?.points ?? 0;
  console.log(`🧭 Index ${index}, points ${points}`);
  return { rank: index + 1, points };
}

function ordinal(n) {
  return ["st", "nd", "rd"][(n % 100 >> 3 ^ 1 && n % 10) - 1] || "th";
}

async function getChannelName(broadcasterId) {
  const doc = await db.collection("streamers").doc(broadcasterId).get();
  return doc.data.channelName;
}

async function saveCurrentSeason(broadcasterId, seasonData) {
  const ref = db.doc(`streamers/${broadcasterId}/campaign/currentSeason`);
  await ref.set(seasonData, { merge: true });
}

async function saveNextSeason(broadcasterId, seasonData) {
  const ref = db.doc(`streamers/${broadcasterId}/campaign/nextSeason`);
  await ref.set(seasonData, { merge: true });
}

async function getSeasonState(broadcasterId) {
  const currentRef = db.doc(`streamers/${broadcasterId}/campaign/currentSeason`);
  const nextRef = db.doc(`streamers/${broadcasterId}/campaign/nextSeason`);
  const [currentSnap, nextSnap] = await Promise.all([currentRef.get(), nextRef.get()]);

  return {
    current: currentSnap.exists ? currentSnap.data() : null,
    next: nextSnap.exists ? nextSnap.data() : null
  };
}

async function archiveSeasonAndActivateNext(broadcasterId, archiveData) {
  const historyRef = db.collection(`streamers/${broadcasterId}/campaign/seasonHistory`);
  await historyRef.add(archiveData);

  const currentRef = db.doc(`streamers/${broadcasterId}/campaign/currentSeason`);
  const nextRef = db.doc(`streamers/${broadcasterId}/campaign/nextSeason`);
  const nextSnap = await nextRef.get();

  if (nextSnap.exists) {
    await currentRef.set(nextSnap.data(), { merge: true });
    await nextRef.delete();
    return true;
  }

  return false;
}

async function clearNextSeason(broadcasterId) {
  const ref = db.doc(`streamers/${broadcasterId}/campaign/nextSeason`);
  await ref.delete();
}

module.exports = { db, saveViewer, getSortedViewer, getFactions, setFactions, getPresetThemes, getPresetThemeById, getCustomThemeById, triggerOverlayUpdate, awardPointsToUser, getOverlaySettings, saveOverlaySettings, resetOverlaySettings, hasSortedFaction, getOrAssignFaction, joinChannel, sendMessageToChat, getStreamerMeta, ordinal, getUserRankInFaction, getFactionRankDetails, getChannelName, saveCurrentSeason, saveNextSeason, getSeasonState, archiveSeasonAndActivateNext, clearNextSeason, getCustomThemes, saveCustomTheme, getStreamerDetails };