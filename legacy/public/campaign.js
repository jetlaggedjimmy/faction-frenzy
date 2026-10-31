let getStreamerProfile;
async function loadStreamerContext() {
  if (!getStreamerProfile) {
    const mod = await import('./streamerContext.js');
    getStreamerProfile = mod.getStreamerProfile;
  }
  return getStreamerProfile();
}
async function initCampaignView() {
  let broadcasterId = null;
  let username = null;
  let accessToken = null;
  try {
    const profile = await loadStreamerContext();
    broadcasterId = profile.id;
    username = profile.displayName;
    accessToken = profile.token || localStorage.getItem('twitchToken');
    window.twitchUsername = username;
    // Optionally update localStorage for legacy code
    localStorage.setItem('twitchBroadcasterId', broadcasterId);
    localStorage.setItem('twitchUser', username);
    if (profile.profileImageUrl) localStorage.setItem('profileImageUrl', profile.profileImageUrl);
  } catch (err) {
    console.error('Failed to fetch streamer profile:', err);
    showToast('Streamer context error. Please log in.', 5000);
    return;
  }

  if (!broadcasterId) return;

  await loadCampaignSettings(broadcasterId);

  // Track selected theme IDs for current/next season
  let currentThemeId = null;
  let nextThemeId = null;

  document.getElementById("saveCurrentSeason").addEventListener("click", async () => {
    const name = document.getElementById("currentSeasonName").value;
    const reward = document.getElementById("currentSeasonReward").value;
    const theme = document.getElementById("currentThemeName").textContent;
    const themeId = currentThemeId;

    const isOngoing = document.getElementById("noEndDateToggle").checked;
    const endDateInput = document.getElementById("currentSeasonEnd").value;
    const endDate = isOngoing ? null : new Date(endDateInput).toISOString();

    const season = {
      name,
      endDate,
      reward,
      theme,
      themeId,
      isOngoing
    };

    try {
      await fetch("https://api-ljrm742ysq-uc.a.run.app/saveCurrentSeason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcasterId, season })
      });

      if (isOngoing) {
        document.getElementById("daysLeft").textContent = "Ongoing";
      } else {
        updateCountdown(endDate);
      }

      showToast("✅ Current season saved");
    } catch (err) {
      console.error("❌ Failed to save current season:", err);
      showToast("⚠️ Failed to save current season", 3500);
    }
  });

  document.getElementById("saveNextSeason").addEventListener("click", async () => {
    const name = document.getElementById("nextSeasonName").value;
    const startDateStr = document.getElementById("nextSeasonStart").value;
    const reward = document.getElementById("nextSeasonReward").value;
    const theme = document.getElementById("nextThemeName").textContent;
    const themeId = nextThemeId;

    const season = {
      name,
      startDate: new Date(startDateStr).toISOString(),
      reward,
      theme,
      themeId
    };

    try {
      await fetch("https://api-ljrm742ysq-uc.a.run.app/saveNextSeason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcasterId, season })
      });
      showToast("✅ Next season scheduled");
    } catch (err) {
      console.error("❌ Failed to save next season:", err);
      showToast("⚠️ Failed to save next season", 3500);
    }
  });

  document.getElementById("noEndDateToggle").addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    const endInput = document.getElementById("currentSeasonEnd");

    if (isChecked) {
      endInput.value = "";                  // Clear stale value
      endInput.disabled = true;
      endInput.style.opacity = "0.5";
    } else {
      endInput.disabled = false;
      endInput.style.opacity = "1";
    }
  });

  // Theme selection modal logic (integrated)
  let themeTarget = null; // 'current' or 'next'
  const themeModal = document.getElementById('themeModal');
  const themeSelection = document.getElementById('theme-selection');
  const groupConfig = document.getElementById('groupConfig');
  const saveThemeAsCustomBtn = document.getElementById('saveThemeAsCustom');

  function showThemeModal(target) {
    themeTarget = target;
    themeModal.style.display = 'flex';
    groupConfig.style.display = 'none';
    saveThemeAsCustomBtn.style.display = 'none';
    fetchThemes();
  }

  document.getElementById('changeCurrentTheme').addEventListener('click', () => {
    showThemeModal('current');
  });
  document.getElementById('changeNextTheme').addEventListener('click', () => {
    showThemeModal('next');
  });

  document.getElementById('closeThemeModal').onclick = () => {
    themeModal.style.display = 'none';
  };

  async function fetchThemes() {
    // Use broadcasterId from context
    const [presetsRes, customsRes] = await Promise.all([
      fetch('https://api-ljrm742ysq-uc.a.run.app/getThemes'),
      fetch(`https://api-ljrm742ysq-uc.a.run.app/getCustomThemes?streamerId=${broadcasterId}`)
    ]);
    const presets = (await presetsRes.json()).themes || [];
    const customs = (await customsRes.json()).themes || [];
    const allThemes = [...presets, ...customs];
    renderThemeTiles(allThemes);
  }

  function renderThemeTiles(themes) {
    themeSelection.innerHTML = themes.map(theme => `
      <div class="theme-tile" data-theme-id="${theme.id}">
        <img class="theme-logo" src="${theme.logo}" alt="${theme.name}" />
        <span class="theme-name">${theme.name}</span>
      </div>
    `).join("");

    // Custom theme tile
    const customTile = document.createElement('div');
    customTile.className = 'theme-tile';
    customTile.dataset.themeId = 'custom';
    customTile.innerHTML = `
      <img class="theme-logo" src="./img/plus.png" alt="Custom Theme" />
      <span class="theme-name">Create my own Factions</span>
    `;
    customTile.onclick = () => selectTheme('custom');
    themeSelection.appendChild(customTile);

    // Add click listeners
    themeSelection.querySelectorAll('.theme-tile').forEach(tile => {
      tile.onclick = () => selectTheme(tile.dataset.themeId);
    });
  }

  async function selectTheme(themeId) {
    themeSelection.querySelectorAll('.theme-tile').forEach(tile => tile.classList.remove('selected'));
    themeSelection.querySelector(`[data-theme-id="${themeId}"]`)?.classList.add('selected');

    if (themeId === 'custom') {
      groupConfig.style.display = 'block';
      saveThemeAsCustomBtn.style.display = 'inline-block';
      populateFactions([
        { name: 'Custom Faction 1', color: '#ff9999', imageUrl: '' },
        { name: 'Custom Faction 2', color: '#99ccff', imageUrl: '' },
        { name: 'Custom Faction 3', color: '#99ff99', imageUrl: '' },
        { name: 'Custom Faction 4', color: '#ffff99', imageUrl: '' }
      ]);
      // Custom theme will get its ID after saving
      if (themeTarget === 'current') {
        currentThemeId = null;
      } else {
        nextThemeId = null;
      }
      return;
    }

    // Otherwise load from database
  // Use broadcasterId from context
    const response = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getThemeDetails?streamerId=${broadcasterId}&themeId=${themeId}`);
    const data = await response.json();
    groupConfig.style.display = 'block';
    saveThemeAsCustomBtn.style.display = 'none';
    populateFactions(data.factions);

    // Set theme name and themeId for current/next season
    if (themeTarget === 'current') {
      document.getElementById('currentThemeName').textContent = data.name;
      document.getElementById('currentFactions').textContent = data.factions.map(f => f.name).join(', ');
      currentThemeId = data.id || themeId;
      // Auto-save theme to Firestore for current season
      autoSaveThemeToSeason('current', data.name, currentThemeId);
    } else {
      document.getElementById('nextThemeName').textContent = data.name;
      document.getElementById('nextFactions').textContent = data.factions.map(f => f.name).join(', ');
      nextThemeId = data.id || themeId;
      // Auto-save theme to Firestore for next season
      autoSaveThemeToSeason('next', data.name, nextThemeId);
    }
    themeModal.style.display = 'none';
    showToast(`🎨 Theme set: ${data.name}`);

  // Helper to auto-save theme selection
  async function autoSaveThemeToSeason(seasonType, themeName, themeId) {
  // Use broadcasterId from context
    // Get current season data from Firestore
    const seasonRes = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getSeasons?broadcasterId=${broadcasterId}`);
    const { current, next } = await seasonRes.json();
    let season = seasonType === 'current' ? current : next;
    if (!season) season = {};
    season.theme = themeName;
    season.themeId = themeId;
    const endpoint = seasonType === 'current' ? 'saveCurrentSeason' : 'saveNextSeason';
    await fetch(`https://api-ljrm742ysq-uc.a.run.app/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcasterId, season })
    });
  }
  }

  function populateFactions(factions) {
    groupConfig.innerHTML = '';
    factions.forEach(cat => {
      const div = document.createElement('div');
      div.className = 'faction-item';
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
          <input type="url" value="${cat.imageUrl || ''}">
        </div>
        <img class="preview" src="${cat.imageUrl || './img/default.png'}" alt="Preview" style="width: 120px; height: 120px; object-fit: contain; margin-left: 10px;" />
        <button type="button" class="removeFaction">❌</button>
      `;
      div.querySelector('.removeFaction').addEventListener('click', () => div.remove());
      bindPreview(div);
      groupConfig.appendChild(div);
    });
  }

  function bindPreview(factionDiv) {
    const imageInput = factionDiv.querySelector('input[type="url"]');
    const preview = factionDiv.querySelector('.preview');
    function updatePreview() {
      const url = imageInput.value.trim();
      preview.onerror = null;
      preview.onerror = () => {
        preview.onerror = null;
        preview.src = './img/default.png';
      };
      preview.src = '';
      preview.src = url || './img/default.png';
    }
    imageInput.addEventListener('input', updatePreview);
    updatePreview();
  }

  saveThemeAsCustomBtn.addEventListener('click', async () => {
    const broadcasterId = localStorage.getItem('twitchBroadcasterId');
    if (!broadcasterId) return showToast('⚠️ No broadcaster ID found');
    const themeName = prompt('Give your theme a name');
    if (!themeName || themeName.trim().length === 0) return showToast('⚠️ Theme name is required');
    const factions = [...groupConfig.querySelectorAll('.faction-item')].map(item => ({
      name: item.querySelector('input[type="text"]').value,
      color: item.querySelector('input[type="color"]').value,
      imageUrl: item.querySelector('input[type="url"]').value.trim() || null
    }));
    if (factions.length === 0) return showToast('⚠️ No factions to save');
    const response = await fetch('https://api-ljrm742ysq-uc.a.run.app/saveCustomTheme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcasterId, themeName, factions })
    });
    if (response.ok) {
      showToast(`🎉 Custom theme '${themeName}' saved`);
      await fetchThemes();
    } else {
      showToast('❌ Failed to save custom theme');
      console.error(await response.text());
    }
  });

  console.log("🎯 Campaign Manager initialized for broadcaster:", broadcasterId);
}

async function loadCampaignSettings(broadcasterId) {
  try {
    const res = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getSeasons?broadcasterId=${broadcasterId}`);
    const { current, next } = await res.json();

    // ⏱ Current
    if (current) {
      document.getElementById("currentSeasonName").value = current.name || "";
      document.getElementById("currentSeasonEnd").value = current.endDate?.slice(0, 16) || "";
      document.getElementById("currentSeasonReward").value = current.reward || "";
      document.getElementById("currentThemeName").textContent = current.theme || "None";
      currentThemeId = current.themeId || null;

      if (current.isOngoing) {
        document.getElementById("noEndDateToggle").checked = true;

        const endInput = document.getElementById("currentSeasonEnd");
        endInput.value = "";
        endInput.disabled = true;
        endInput.style.opacity = "0.5";
      } else if (current.endDate) {
        document.getElementById("currentSeasonEnd").value = current.endDate?.slice(0, 16);
      }
      document.getElementById("currentThemeName").textContent = current.theme && current.theme.trim() ? current.theme : "No Theme Selected";
      
      updateCountdown(current.endDate);

    }

    // 🔜 Next
    if (next) {
      document.getElementById("nextSeasonName").value = next.name || "";
      document.getElementById("nextSeasonStart").value = next.startDate?.slice(0, 16) || "";
      document.getElementById("nextSeasonReward").value = next.reward || "";
      document.getElementById("nextThemeName").textContent = next.theme && next.theme.trim() ? next.theme : "No Theme Selected";
      nextThemeId = next.themeId || null;
    }
  } catch (err) {
    console.error("⚠️ Error loading season data:", err);
  }
}

function updateCountdown(endDateStr) {
  const countdownText = document.getElementById("daysLeft");

  if (!endDateStr || endDateStr === "null" || endDateStr === "") {
    countdownText.textContent = "Ongoing";
    return;
  }

  const now = new Date();
  const end = new Date(endDateStr);
  const msLeft = end - now;

  countdownText.textContent =
    msLeft > 0
      ? `${Math.ceil(msLeft / (1000 * 60 * 60 * 24))} day${msLeft > 86400000 ? "s" : ""} left`
      : "Season ended";
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, duration);
}

// Initialize campaign view when script loads
initCampaignView();