import { getStreamerProfile } from './streamerContext.js';
async function initLeaderboard_overlay_settings() {
  let broadcasterId = null;
  let username = null;
  let accessToken = null;
  try {
    const profile = await getStreamerProfile();
    broadcasterId = profile.id;
    username = profile.displayName;
    accessToken = profile.token || localStorage.getItem('twitchToken');
    window.twitchUsername = username;
    localStorage.setItem('twitchBroadcasterId', broadcasterId);
    localStorage.setItem('twitchUser', username);
    if (profile.profileImageUrl) localStorage.setItem('profileImageUrl', profile.profileImageUrl);
  } catch (err) {
    console.error('Failed to fetch streamer profile:', err);
    showToast('Streamer context error. Please log in.', 5000);
    return;
  }

  const previewFrame = document.getElementById("leaderboardOverlayPreviewFrame");
  if (previewFrame && broadcasterId) {
    const previewUrl = `${window.location.origin}/leaderboard.html?id=${broadcasterId}&preview=true`;
    previewFrame.src = previewUrl;
  }

  const obsUrl = `${window.location.origin}/leaderboard.html?id=${broadcasterId}`;
  document.getElementById("leaderboard-overlay-url").innerText = obsUrl;

  document.getElementById("leaderboardOverlaySettingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const font = document.querySelector('[name="font"]').value;
    const fontSize = document.querySelector('[name="fontSize"]').value;
    const fontWeight = document.querySelector('[name="fontWeight"]').value;
    const imageHeight = document.querySelector('[name="imageHeight"]').value;
    const imageWidth = document.querySelector('[name="imageWidth"]').value;
    const rowHeight = document.querySelector('[name="rowHeight"]').value;
    const rowWidth = document.querySelector('[name="rowWidth"]').value;
    const paddingTop = document.querySelector('[name="paddingTop"]').value;
    const paddingRight = document.querySelector('[name="paddingRight"]').value;
    const paddingBottom = document.querySelector('[name="paddingBottom"]').value;
    const paddingLeft = document.querySelector('[name="paddingLeft"]').value;
    const radiusTopLeft = document.querySelector('[name="radiusTopLeft"]').value;
    const radiusTopRight = document.querySelector('[name="radiusTopRight"]').value;
    const radiusBottomRight = document.querySelector('[name="radiusBottomRight"]').value;
    const radiusBottomLeft = document.querySelector('[name="radiusBottomLeft"]').value;
    const customCSS = document.querySelector('[name="customCSS"]').value;

    const saveButton = document.querySelector("button[type=submit]");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const response = await fetch("https://api-ljrm742ysq-uc.a.run.app/saveOverlaySettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamerId: broadcasterId,
        overlay: `leaderboard`,
        settings: { font, fontWeight, fontSize, imageHeight, imageWidth, rowHeight, rowWidth, paddingTop, paddingRight, paddingBottom, paddingLeft, radiusTopLeft, radiusTopRight, radiusBottomRight, radiusBottomLeft, customCSS }
      })
    });

    if (response.ok) {
      showToast("✨ Settings saved!");
      if (previewFrame && broadcasterId) {
        setTimeout(() => {
          previewFrame.src = `${window.location.origin}/leaderboard.html?id=${broadcasterId}&preview=true&rand=${Date.now()}`;
        }, 300); // 💬 Delay forces overlay to pull updated settings
      }
    } else {
      showToast("⚠️ Failed to save settings.");
      console.error(await response.text());
    }

    saveButton.disabled = false;
    saveButton.textContent = "Save Settings";
  });

  document.getElementById("resetSettings").addEventListener("click", async () => {
    const broadcasterId = localStorage.getItem("twitchBroadcasterId");
    if (!broadcasterId) return;

    const confirmReset = confirm("Are you sure you want to restore default leaderboard overlay settings?");
    if (!confirmReset) return;

    const response = await fetch("https://api-ljrm742ysq-uc.a.run.app/resetOverlaySettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamerId: broadcasterId })
    });

    if (response.ok) {
      showToast("🔄 Settings reset to default.");
      // Optionally re-fetch and reload
      loadSettings(broadcasterId);
      if (previewFrame && broadcasterId) {
        setTimeout(() => {
          previewFrame.src = `${window.location.origin}/leaderboard.html?id=${broadcasterId}&preview=true&rand=${Date.now()}`;
        }, 300); // 💬 Delay forces overlay to pull updated settings
      }
    } else {
      showToast("⚠️ Failed to reset settings.");
      console.error(await response.text());
    }
  });

  document.getElementById("fontSelect").addEventListener("change", (e) => {
    const font = e.target.value;
    const preview = document.getElementById("fontPreview");
    const newFontClass = `font-${font.toLowerCase().replace(/ /g, "-")}`;

    // Remove existing font-* classes
    preview.classList.forEach(cls => {
      if (cls.startsWith("font-")) preview.classList.remove(cls);
    });

    // Add the new one
    preview.classList.add(newFontClass);
  });

  document.getElementById("weightSelect").addEventListener("change", (e) => {
    const weight = e.target.value;
    const preview = document.getElementById("fontPreview");
    preview.style.fontWeight = `${weight}`;
  });

  document.getElementById("fontSize").addEventListener("input", (e) => {
    const fontSize = e.target.value;
    const preview = document.getElementById("fontPreview");
    preview.style.fontSize = `${fontSize}px`;
  });

  document.getElementById("copyUrlButton").addEventListener("click", () => {
    const urlText = document.getElementById("leaderboard-overlay-url").textContent;
    navigator.clipboard.writeText(urlText).then(() => {
      const btn = document.getElementById("copyUrlButton");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    });
  });

  console.log("🔍 broadcasterId value:", broadcasterId, typeof broadcasterId);

  loadLeaderboardSettings(broadcasterId);

}

function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, duration);
}

async function loadLeaderboardSettings(broadcasterId) {
  const res = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getOverlaySettings?streamerId=${broadcasterId}&overlay=leaderboard`);
  const { settings } = await res.json();

  document.querySelector('[name="font"]').value = settings.font || "Inter";
  document.querySelector('[name="fontSize"]').value = settings.fontSize || "14";
  document.querySelector('[name="fontWeight"]').value = settings.fontWeight || "400";
  document.querySelector('[name="imageHeight"]').value = settings.imageHeight || "50";
  document.querySelector('[name="imageWidth"]').value = settings.imageWidth || "100";
  document.querySelector('[name="rowHeight"]').value = settings.rowHeight || "50";
  document.querySelector('[name="rowWidth"]').value = settings.rowWidth || "265";
  document.querySelector('[name="paddingTop"]').value = settings.paddingTop || "4";
  document.querySelector('[name="paddingRight"]').value = settings.paddingRight || "12";
  document.querySelector('[name="paddingBottom"]').value = settings.paddingBottom || "4";
  document.querySelector('[name="paddingLeft"]').value = settings.paddingLeft || "12";
  document.querySelector('[name="radiusTopLeft"]').value = settings.radiusTopLeft || "4";
  document.querySelector('[name="radiusTopRight"]').value = settings.radiusTopRight || "4";
  document.querySelector('[name="radiusBottomRight"]').value = settings.radiusBottom || "4";
  document.querySelector('[name="radiusBottomLeft"]').value = settings.radiusLeft || "4";

  const font = settings.font || "Inter"; // fallback to default
  const preview = document.getElementById("fontPreview");
  const fontClass = `font-${font.toLowerCase().replace(/ /g, "-")}`;

  // Remove any old font-* class
  preview.classList.forEach(cls => {
    if (cls.startsWith("font-")) preview.classList.remove(cls);
  });
}

initLeaderboard_overlay_settings();