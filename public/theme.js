let getStreamerProfile;
async function loadStreamerContext() {
  if (!getStreamerProfile) {
    const mod = await import('./streamerContext.js');
    getStreamerProfile = mod.getStreamerProfile;
  }
  return getStreamerProfile();
}
function bindPreview(factionDiv) {
  const imageInput = factionDiv.querySelector('input[type="url"]');
  const preview = factionDiv.querySelector(".preview");

  function updatePreview() {
    const url = imageInput.value.trim();

    // Clear existing error handler
    preview.onerror = null;

    // Set a new one before assigning .src
    preview.onerror = () => {
      preview.onerror = null; // prevent loops
      preview.src = "./img/default.png";
    };

    // Force refresh by clearing then setting
    preview.src = "";
    preview.src = url || "./img/default.png";
  }

  imageInput.addEventListener("input", updatePreview);

  // Trigger once immediately in case of pre-filled values
  updatePreview();
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, duration);
}

async function loadSavedSettings() {
  const broadcasterId = localStorage.getItem("twitchBroadcasterId");
  console.log("🔍 broadcasterId value:", broadcasterId, typeof broadcasterId);

  const themeRes = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getTheme?broadcasterId=${broadcasterId}`);
  const { factions = [] } = await themeRes.json();

  console.log("📦 Received factions from getTheme:", factions);

  const container = document.getElementById("factions");
  container.innerHTML = ""; // Clear existing entries

  factions.forEach(fac => {
    const div = document.createElement("div");
    div.className = "faction-item";
    div.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <label>Group Name</label>
        <input type="text" value="${fac.name}">
      </div>
      <div style="display: flex; flex-direction: column;">
        <label>Color</label>
        <input type="color" value="${fac.color}">
      </div>
      <div style="display: flex; flex-direction: column;">
        <label>Image URL</label>
        <input type="url" placeholder="Group image URL (optional)" value="${fac.imageUrl || ""}">
      </div>
      <img class="preview" src="${fac.imageUrl || "./img/default.png"}" alt="Preview" style="width: 120px; height: 120px; object-fit: contain; margin-left: 10px;" />
      <button type="button" class="removeFaction">❌</button>
    `;
    container.appendChild(div);
    div.querySelector(".removeFaction").addEventListener("click", () => div.remove());
    bindPreview(div);
  });
}

async function fetchThemes() {
  const broadcasterId = localStorage.getItem("twitchBroadcasterId");
  const [presetsRes, customsRes] = await Promise.all([
    fetch("https://api-ljrm742ysq-uc.a.run.app/getThemes"),
    fetch(`https://api-ljrm742ysq-uc.a.run.app/getCustomThemes?streamerId=${broadcasterId}`)
  ]);

  const presets = (await presetsRes.json()).themes || [];
  const customs = (await customsRes.json()).themes || [];

  const allThemes = [...presets, ...customs];
  renderThemeTiles(allThemes);
}

function renderThemeTiles(themes) {
  const container = document.getElementById("theme-selection");

  container.innerHTML = themes.map(theme => {
    // Use profile image for custom themes
    let logoSrc = theme.logo || './img/default.png';
    let badge = '';
    // If theme is a custom theme and has sourcePresetId, overlay badge
    if (theme.sourcePresetId) {
      badge = `<span class="preset-badge" style="position:absolute;top:4px;right:4px;background:#fc8911;color:#fff;padding:2px 6px;border-radius:6px;font-size:11px;z-index:2;">Preset</span>`;
    }
    return `
      <div class="theme-tile" data-theme-id="${theme.id}" style="position:relative;" onclick="selectTheme('${theme.id}')">
        ${badge}
        <img class="theme-logo" src="${logoSrc}" alt="${theme.name}" />
        <span class="theme-name">${theme.name}</span>
      </div>
    `;
  }).join("");

  // Append custom theme tile
  const customTile = document.createElement("div");
  customTile.className = "theme-tile";
  customTile.dataset.themeId = "custom";
  customTile.innerHTML = `
    <img class="theme-logo" src="./img/plus.png" alt="Custom Theme" />
    <span class="theme-name">Create my own Factions</span>
  `;
  customTile.addEventListener("click", () => selectTheme("custom"));
  container.appendChild(customTile);
}

async function selectTheme(themeId) {
  const broadcasterId = localStorage.getItem("twitchBroadcasterId");
  document.querySelectorAll(".theme-tile").forEach(tile => tile.classList.remove("selected"));
  document.querySelector(`[data-theme-id="${themeId}"]`)?.classList.add("selected");

  if (themeId === "custom") {
    const placeholderFactions = [
      { name: "Custom Faction 1", color: "#ff9999", imageUrl: "" },
      { name: "Custom Faction 2", color: "#99ccff", imageUrl: "" },
      { name: "Custom Faction 3", color: "#99ff99", imageUrl: "" },
      { name: "Custom Faction 4", color: "#ffff99", imageUrl: "" }
    ];
    return populateFactions(placeholderFactions);
  }

  // Otherwise load from database
  const response = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getThemeDetails?streamerId=${broadcasterId}&themeId=${themeId}`);
  const data = await response.json();

  populateFactions(data.factions);
}

function populateFactions(factions) {
  const container = document.getElementById("factions");
  container.innerHTML = ""; // Clear existing entries

  factions.forEach(cat => {
    const div = document.createElement("div");
    div.className = "faction-item";
    div.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <label>Team Name</label>
        <input type="text" value="${cat.name}">
      </div>
      <div style="display: flex; flex-direction: column;">
        <label>Color</label>
        <input type="color" value="${cat.color}">
      </div>
      <div style="display: flex; flex-direction: column;">
        <label>Image URL</label>
        <input type="url" value="${cat.imageUrl || ""}">
      </div>
      <img class="preview" src="${cat.imageUrl || "./img/default.png"}" alt="Preview" 
          style="width: 120px; height: 120px; object-fit: contain; margin-left: 10px;" />
      <button type="button" class="removeFaction">❌</button>
    `;

    div.querySelector(".removeFaction").addEventListener("click", () => div.remove());

    container.appendChild(div);
    bindPreview(div);
  });
}

async function initThemeView() {
  let broadcasterId = null;
  let username = null;
  let accessToken = null;
  try {
    const profile = await loadStreamerContext();
    broadcasterId = profile.id;
    username = profile.displayName;
    accessToken = profile.token || localStorage.getItem('twitchToken');
    // Optionally update localStorage for legacy code
    localStorage.setItem('twitchBroadcasterId', broadcasterId);
    localStorage.setItem('twitchUser', username);
    if (profile.profileImageUrl) localStorage.setItem('profileImageUrl', profile.profileImageUrl);
  } catch (err) {
    console.error('Failed to fetch streamer profile:', err);
    showToast('Streamer context error. Please log in.', 5000);
    return;
  }
  console.log('🎯 broadcasterId value:', broadcasterId, typeof broadcasterId);

  await fetchThemes(broadcasterId);
  await loadSavedSettings(broadcasterId);

  const groupConfig = document.getElementById('groupConfig');
  groupConfig.style.display = 'block';
  setTimeout(() => groupConfig.classList.add('show'), 10); // let it mount before animating

  document.getElementById('saveThemeAsCustom')?.addEventListener('click', async () => {
    if (!broadcasterId) return showToast('⚠️ No broadcaster ID found');
    const themeName = prompt('Give your theme a name');
    if (!themeName || themeName.trim().length === 0) return showToast('⚠️ Theme name is required');
    const factions = [...document.querySelectorAll('.faction-item')].map(item => ({
      name: item.querySelector("input[type='text']").value,
      color: item.querySelector("input[type='color']").value,
      imageUrl: item.querySelector("input[type='url']").value.trim() || null
    }));
    if (factions.length === 0) return showToast('⚠️ No factions to save');
    const response = await fetch('https://api-ljrm742ysq-uc.a.run.app/saveCustomTheme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcasterId, themeName, factions })
    });
    if (response.ok) {
      showToast(`🎉 Custom theme '${themeName}' saved`);
      await fetchThemes(broadcasterId); // Refresh tile list if you're merging custom & preset here
    } else {
      showToast('❌ Failed to save custom theme');
      console.error(await response.text());
    }
  });

  // 🏗️ Add and remove factions dynamically
  document.getElementById('addFaction').addEventListener('click', () => {
    const factionDiv = document.createElement('div');
    factionDiv.classList.add('faction-item');
    factionDiv.innerHTML = `
        <div style="display: flex; flex-direction: column;">
          <label>Group Name</label>
          <input type="text">
        </div>
        <div style="display: flex; flex-direction: column;">
          <label>Color</label>
          <input type="color">
        </div>
        <div style="display: flex; flex-direction: column;">
          <label>Image URL</label>
          <input type="url" placeholder="Group image URL (optional)">
        </div>
        <img class="preview" src="" alt="Preview" style="width: 120px; height: 120px; object-fit: contain; margin-left: 10px;" />
        <button type="button" class="removeFaction">❌</button>
    `;
    document.getElementById('factions').appendChild(factionDiv);
    factionDiv.querySelector('.removeFaction').addEventListener('click', () => {
      factionDiv.remove();
    });
    bindPreview(factionDiv);
  });

  document.querySelectorAll('.removeFaction').forEach(button => {
    button.addEventListener('click', () => {
      button.parentElement.remove();
    });
  });
  document.querySelectorAll('.faction-item').forEach(bindPreview);
}