async function initSorter_overlay_settings() {
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

  const previewFrame = document.getElementById("sorterOverlayPreviewFrame");
  if (previewFrame && broadcasterId) {
    const previewUrl = `${window.location.origin}/overlay.html?id=${broadcasterId}&preview=true`;
    previewFrame.src = previewUrl;
  }

  const obsUrl = `${window.location.origin}/overlay.html?id=${broadcasterId}`;
  document.getElementById("sorter-overlay-url").innerText = obsUrl;

  document.getElementById("sorterOverlaySettingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const font = document.querySelector('[name="font"]').value;
    const fontSize = document.querySelector('[name="fontSize"]').value;
    const fontWeight = document.querySelector('[name="fontWeight"]').value;
    const outlineColor = document.querySelector('[name="outlineColor"]').value;
    const outlineWidth = document.querySelector('[name="outlineWidth"]').value;
    const imageHeight = document.querySelector('[name="imageHeight"]').value;
    const imageWidth = document.querySelector('[name="imageWidth"]').value;
    const paddingTop = document.querySelector('[name="paddingTop"]').value;
    const paddingBottom = document.querySelector('[name="paddingBottom"]').value;
    const customCSS = document.querySelector('[name="customCSS"]').value;

    const saveButton = document.querySelector("button[type=submit]");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const response = await fetch("https://api-ljrm742ysq-uc.a.run.app/saveOverlaySettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamerId: broadcasterId,
        overlay: `sorter`,
        settings: { font, fontWeight, fontSize, outlineColor, outlineWidth, imageHeight, imageWidth, paddingTop, paddingBottom, customCSS }
      })
    });

    if (response.ok) {
      showToast("✨ Settings saved!");
      if (previewFrame && broadcasterId) {
        setTimeout(() => {
          previewFrame.src = `${window.location.origin}/overlay.html?id=${broadcasterId}&preview=true&rand=${Date.now()}`;
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

    const confirmReset = confirm("Are you sure you want to restore default sorter overlay settings?");
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
          previewFrame.src = `${window.location.origin}/overlay.html?id=${broadcasterId}&preview=true&rand=${Date.now()}`;
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

  document.querySelector('[name="outlineWidth"]').addEventListener("input", (e) => {
    const outlineWidth = e.target.value;
    const outlineColor = document.querySelector('[name="outlineColor"]').value;
    const preview = document.getElementById("fontPreview");
    preview.style.textShadow =
      `-${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
       ${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
       -${outlineWidth}px ${outlineWidth}px 0 ${outlineColor},
       ${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`;
  });

  document.querySelector('[name="outlineColor"]').addEventListener("change", (e) => {
    const outlineColor = e.target.value;
    const outlineWidth = document.querySelector('[name="outlineWidth"]').value;
    const preview = document.getElementById("fontPreview");
    preview.style.textShadow =
      `-${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
       ${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
       -${outlineWidth}px ${outlineWidth}px 0 ${outlineColor},
       ${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`;
  });

  document.getElementById("copyUrlButton").addEventListener("click", () => {
    const urlText = document.getElementById("sorter-overlay-url").textContent;
    navigator.clipboard.writeText(urlText).then(() => {
      const btn = document.getElementById("copyUrlButton");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    });
  });

  console.log("🔍 broadcasterId value:", broadcasterId, typeof broadcasterId);

  loadSettings(broadcasterId);

}

function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, duration);
}

async function loadSettings(broadcasterId) {
  const res = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getOverlaySettings?streamerId=${broadcasterId}&overlay=sorter`);
  const { settings } = await res.json();

  document.querySelector('[name="font"]').value = settings.font || "Inter";
  document.querySelector('[name="fontSize"]').value = settings.fontSize || "30";
  document.querySelector('[name="outlineColor"]').value = settings.outlineColor || "#FFFFFF";
  document.querySelector('[name="outlineWidth"]').value = settings.outlineWidth || "1";
  document.querySelector('[name="imageHeight"]').value = settings.imageHeight || "200";
  document.querySelector('[name="imageWidth"]').value = settings.imageWidth || "200";
  document.querySelector('[name="paddingTop"]').value = settings.paddingTop || "20";
  document.querySelector('[name="paddingBottom"]').value = settings.paddingBottom || "20";
  document.querySelector('[name="fontWeight"]').value = settings.fontWeight || "400";

  const font = settings.font || "Inter"; // fallback to default
  const preview = document.getElementById("fontPreview");
  const fontClass = `font-${font.toLowerCase().replace(/ /g, "-")}`;
  const outlineWidth = settings.outlineWidth;
  const outlineColor = settings.outlineColor;

  // Remove any old font-* class
  preview.classList.forEach(cls => {
    if (cls.startsWith("font-")) preview.classList.remove(cls);
  });

  preview.classList.add(fontClass);
  preview.style.fontWeight = settings.fontWeight;
  preview.style.fontSize = `${settings.fontSize}px`;
  preview.style.textShadow =
    `-${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
     ${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
     -${outlineWidth}px ${outlineWidth}px 0 ${outlineColor},
     ${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`;
}

initSorter_overlay_settings();