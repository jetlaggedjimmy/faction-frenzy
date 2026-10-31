import { getStreamerProfile } from './streamerContext.js';
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
  import { getFirestore, doc, collection, onSnapshot, query, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";
  import autoAnimate from "https://esm.sh/@formkit/auto-animate@1.0.0-beta.4";

  const app = initializeApp({
    apiKey: "4wwna5bmgdjffbm5k82iab5p867623",
    authDomain: "faction-frenzy.firebaseapp.com",
    projectId: "faction-frenzy"
  });

  const db = getFirestore(app);

  let streamerId = null;
  let previewMode = false;
  try {
    const profile = await getStreamerProfile();
    streamerId = profile.id;
    // Optionally update localStorage for legacy code
    localStorage.setItem('twitchBroadcasterId', streamerId);
    previewMode = window.location.search.includes('preview=true');
  } catch (err) {
    console.error('Failed to fetch streamer profile:', err);
    return;
  }
  let settings = {};

  try {
    const settingsRef = doc(db, "streamers", streamerId);
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      settings = data.leaderboardOverlaySettings || {};
    }
  } catch (err) {
    console.error("❌ Failed to fetch overlaySettings:", err);
  }

  if (settings.font) {
    await document.fonts.load(`1em "${settings.font}"`);
    const font = settings.font || 'Inter';
    const fontClass = `font-${font.toLowerCase().replace(/ /g, "-")}`;
    document.body.classList.add(fontClass);
  }

  if (settings.customCSS) {
    const styleTag = document.createElement("style");
    styleTag.textContent = settings.customCSS;
    document.head.appendChild(styleTag);
  }

  let previewFactions = [];

  const factionsDiv = document.getElementById("factions");
  autoAnimate(factionsDiv, {
    duration: 1500,
    easing: 'ease-in-out',
    keyframes: (el, action) => {
      if (action === 'move') {
        return [
          { transform: 'translateY(0px)' },
          { transform: 'translateY(0px)' }
        ];
      }
      return [];
    }
  });

  let lastCategoryPoints = {};

  // Live faction points
  const streamerRef = doc(db, "streamers", streamerId);

  getDoc(streamerRef).then(docSnap => {
    const data = docSnap.data();
    const factions = [...(data.factions || [])];

    if (previewMode) {
      // Clone factions and reset points
      previewFactions = factions.map(f => ({
        ...f,
        points: 0
      }));
      lastCategoryPoints = {};
      renderFactions(previewFactions, settings);
      startPreviewLoop();
    } else {
      factions.sort((a, b) => (b.points || 0) - (a.points || 0));
      renderFactions(factions, settings);
    }
  });

  if (!previewMode) {
    onSnapshot(streamerRef, docSnap => {
      const data = docSnap.data();
      const factions = [...(data.factions || [])];

      // Sort factions by points
      factions.sort((a, b) => (b.points || 0) - (a.points || 0));

      // Track which faction changed
      let changedFactionName = null;
      factions.forEach(fac => {
        const prev = lastCategoryPoints[fac.name] || 0;
        const current = fac.points || 0;
        if (current > prev) {
          changedFactionName = fac.name;
        }
        lastCategoryPoints[fac.name] = current;
      });

      flipAnimate(factionsDiv, () => {
        factions.forEach(fac => {
          const el = factionsDiv.querySelector(`[data-faction-name="${fac.name}"]`);
          if (el) factionsDiv.appendChild(el);
        });
      }, changedFactionName);

      // Then reorder
      factions.forEach(fac => {
        const el = factionsDiv.querySelector(`[data-faction-name="${fac.name}"]`);
        if (el) factionsDiv.appendChild(el);
      });

      // Update content
      factions.forEach(fac => {
        const el = factionsDiv.querySelector(`[data-faction-name="${fac.name}"]`);
        if (el) {
          el.querySelector(".faction-name").textContent = fac.name;
          el.querySelector(".faction-points").textContent = `${fac.points || 0} pts`;
          const img = el.querySelector(".faction-image img");
          if (img && img.src !== fac.imageUrl) {
            img.src = fac.imageUrl;
          }
          
          let baseColor = fac.color || "#444";
          if (isLightColor(baseColor)) {
            baseColor = darken(baseColor, 0.2);
          }

          el.style.backgroundColor = baseColor;
          el.style.color = getContrastingTextColor(baseColor);
        }
      });

      // Apply bump effect
      if (changedFactionName) {
        const changedEl = factionsDiv.querySelector(`[data-faction-name="${changedFactionName}"]`);
        if (changedEl) {
          changedEl.classList.add("bump");
          setTimeout(() => changedEl.classList.remove("bump"), 600);
        }
      }
    });
  }

  function flipAnimate(container, reorderFn, elevatedFactionName = null) {
    const elements = Array.from(container.children);
    const firstRects = new Map();

    elements.forEach(el => {
      firstRects.set(el, el.getBoundingClientRect());
      el.style.transform = 'translate(0, 0)'; // ✅ Prime transform
    });

    reorderFn(); // Perform DOM reordering

    let elevatedEl = null;

    requestAnimationFrame(() => {
      elements.forEach(el => {
        const lastRect = el.getBoundingClientRect();
        const firstRect = firstRects.get(el);

        const deltaX = firstRect.left - lastRect.left;
        const deltaY = firstRect.top - lastRect.top;

        const moved = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
        const isElevated = el.dataset.factionName === elevatedFactionName;

        if (isElevated) {
          elevatedEl = el;
          el.style.zIndex = '9999';
          el.style.pointerEvents = 'none';
        }

        if (moved) {
          el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
          el.style.transition = 'transform 0.5s ease';

          requestAnimationFrame(() => {
            el.style.transform = '';
          });

          el.addEventListener('transitionend', () => {
            el.style.transition = '';
          }, { once: true });
        }
      });

      if (elevatedEl) {
        setTimeout(() => {
          elevatedEl.style.zIndex = '';
          elevatedEl.style.pointerEvents = '';
        }, 1550);
      }
    });
  }

  function renderFactions(factions, settings = {}) {
    factions.forEach(fac => {
      const div = document.createElement("div");
      div.className = "faction";
      div.dataset.factionName = fac.name;

      let baseColor = fac.color || "#444";
      if (isLightColor(baseColor)) {
        baseColor = darken(baseColor, 0.2);
      }

      div.style.backgroundColor = baseColor;
      div.style.color = getContrastingTextColor(baseColor);

      // Apply padding
      div.style.paddingTop = settings.paddingTop ? `${settings.paddingTop}px` : "4px";
      div.style.paddingRight = settings.paddingRight ? `${settings.paddingRight}px` : "12px";
      div.style.paddingBottom = settings.paddingBottom ? `${settings.paddingBottom}px` : "4px";
      div.style.paddingLeft = settings.paddingLeft ? `${settings.paddingLeft}px` : "12px";

      // Apply border radius
      div.style.borderTopLeftRadius = settings.radiusTopLeft ? `${settings.radiusTopLeft}px` : "4px";
      div.style.borderTopRightRadius = settings.radiusTopRight ? `${settings.radiusTopRight}px` : "4px";
      div.style.borderBottomRightRadius = settings.radiusBottom ? `${settings.radiusBottom}px` : "4px";
      div.style.borderBottomLeftRadius = settings.radiusLeft ? `${settings.radiusLeft}px` : "4px";

      // Apply font styles
      div.style.fontFamily = settings.font || "Inter";
      div.style.fontSize = settings.fontSize ? `${settings.fontSize}px` : "14px";
      div.style.fontWeight = settings.fontWeight || "400";

      // Apply row dimensions
      div.style.height = settings.rowHeight ? `${settings.rowHeight}px` : "50px";
      div.style.width = settings.rowWidth ? `${settings.rowWidth}px` : "265px";

      div.innerHTML = `
        <div class="faction-image">
          <img
            style="max-height: ${settings.imageHeight || 40}px; max-width: ${settings.imageWidth || 100}px;"
            src="${fac.imageUrl}"
            alt="${fac.name}"
          />
        </div>
        <div class="faction-name">${fac.name}</div>
        <div class="faction-points">${fac.points || 0} pts</div>
      `;

      factionsDiv.appendChild(div);
    });
  }

  function isLightColor(hex) {
    const color = hex.replace("#", "");
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 200;
  }

  function darken(hex, percent = 0.2) {
    const color = hex.replace("#", "");
    const r = Math.round(parseInt(color.substring(0, 2), 16) * (1 - percent));
    const g = Math.round(parseInt(color.substring(2, 4), 16) * (1 - percent));
    const b = Math.round(parseInt(color.substring(4, 6), 16) * (1 - percent));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  function getContrastingTextColor(bgColor) {
    const color = bgColor.replace("#", "");
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);

    // Calculate luminance
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > 128 ? "#000000" : "#ffffff"; // Light bg → dark text, dark bg → light text
  }

  function startPreviewLoop() {
    setInterval(() => {
      if (previewFactions.length === 0) return;

      const index = Math.floor(Math.random() * previewFactions.length);
      const faction = previewFactions[index];
      const increment = Math.floor(Math.random() * 20) + 1;
      faction.points += increment;

      const sorted = [...previewFactions].sort((a, b) => b.points - a.points);
      const changedFactionName = faction.name;

      sorted.forEach(fac => {
        lastCategoryPoints[fac.name] = fac.points;
      });

      flipAnimate(factionsDiv, () => {
        sorted.forEach(fac => {
          const el = factionsDiv.querySelector(`[data-faction-name="${fac.name}"]`);
          if (el) factionsDiv.appendChild(el);
        });
      }, changedFactionName);

      sorted.forEach(fac => {
        const el = factionsDiv.querySelector(`[data-faction-name="${fac.name}"]`);
        if (el) {
          el.querySelector(".faction-name").textContent = fac.name;
          el.querySelector(".faction-points").textContent = `${fac.points} pts`;
          const img = el.querySelector(".faction-image img");
          if (img && img.src !== fac.imageUrl) {
            img.src = fac.imageUrl;
          }


          let baseColor = fac.color || "#444";
          if (isLightColor(baseColor)) {
            baseColor = darken(baseColor, 0.2);
          }

          el.style.backgroundColor = baseColor;
          el.style.color = getContrastingTextColor(baseColor);
        }
      });

      const changedEl = factionsDiv.querySelector(`[data-faction-name="${changedFactionName}"]`);
      if (changedEl) {
        changedEl.classList.add("bump");
        setTimeout(() => changedEl.classList.remove("bump"), 600);
      }
    }, 9000); // Every 9 seconds
  }