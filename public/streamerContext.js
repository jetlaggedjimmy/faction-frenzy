// Utility to fetch streamer profile from Firestore using Twitch user ID or token
export async function getStreamerProfile() {
  // Try to get Twitch user ID or token from localStorage
  const twitchUserId = localStorage.getItem('twitchUserId');
  const twitchToken = localStorage.getItem('twitchToken');
  if (!twitchUserId && !twitchToken) {
    throw new Error('Missing Twitch user ID or token. Please log in.');
  }
  // Prefer userId, fallback to token if needed
  const queryParam = twitchUserId ? `streamerId=${twitchUserId}` : `token=${twitchToken}`;
  const res = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getStreamerProfile?${queryParam}`);
  if (!res.ok) throw new Error('Failed to fetch streamer profile');
  return await res.json();
}

// Usage example:
// import { getStreamerProfile } from './streamerContext.js';
// const profile = await getStreamerProfile();
// localStorage.setItem('twitchBroadcasterId', profile.id);
// localStorage.setItem('twitchUser', profile.displayName);
// localStorage.setItem('profileImageUrl', profile.profileImageUrl);
