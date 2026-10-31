import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, doc, getDoc, onSnapshot, collection, query, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const app = initializeApp({
  apiKey: "4wwna5bmgdjffbm5k82iab5p867623",
  authDomain: "faction-frenzy.firebaseapp.com",
  projectId: "faction-frenzy"
});

const db = getFirestore(app);

(async () => {
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
      settings = data.sorterOverlaySettings || {};
    }
  } catch (err) {
    console.error("❌ Failed to fetch overlaySettings:", err);
  }

  if (previewMode) {
    await new Promise(resolve => setTimeout(resolve, 500)); // ⏱ slight delay before spinning
  }

  if (settings.font) {
    await document.fonts.load(`1em "${settings.font}"`);
    document.body.style.fontFamily = `"${settings.font}", sans-serif`;
  }

  if (settings.customCSS) {
    const styleTag = document.createElement("style");
    styleTag.textContent = settings.customCSS;
    document.head.appendChild(styleTag);
  }

  if (!streamerId) return;

  window.__processingSub = false; // Initialize lock

  let factionMap = {};

  try {
    const res = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getTheme?broadcasterId=${streamerId}`);
    const { factions = [] } = await res.json();

    if (Array.isArray(factions)) {
      factions.forEach(faction => {
        if (faction?.name && faction?.imageUrl) {
          const key = faction.name.trim().toLowerCase();
          factionMap[key] = {
            displayName: faction.name,
            imageUrl: faction.imageUrl,
            color: faction.color
          };
        }
      });
    }
  } catch (err) {
    console.error("❌ Failed to fetch factions via API:", err);
  }

  if (previewMode) {
    const slotContainer = document.querySelector(".slot");
    const welcomeText = document.getElementById("welcomeHouse");
    const usernameText = document.getElementById("usernameTag");
    const outlineColor = settings.outlineColor || "#ffffff";
    const outlineWidth = parseInt(settings.outlineWidth || "1");
    const font = settings.font || 'Inter';
    const fontClass = `font-${font.toLowerCase().replace(/ /g, "-")}`;
    welcomeText.classList.add(fontClass);
    usernameText.classList.add(fontClass);

    welcomeText.classList.remove("fading-out", "visible");
    usernameText.classList.remove("fading-out", "visible");
    welcomeText.style.marginBottom = `${settings.paddingTop || "20"}px`;
    welcomeText.style.fontSize = `${settings.fontSize || "20"}px`;
    welcomeText.style.fontWeight = `${settings.fontWeight || "400"}`;
    usernameText.style.marginTop = `${settings.paddingBottom || "20"}px`;
    usernameText.style.fontSize = `${settings.fontSize || "20"}px`;
    usernameText.style.fontWeight = `${settings.fontWeight || "400"}`;
    slotContainer.classList.remove("fading-out");

    welcomeText.style.textShadow = usernameText.style.textShadow =
      `-${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
       ${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
       -${outlineWidth}px ${outlineWidth}px 0 ${outlineColor},
       ${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`;

    // Rebuild slot images
    slotContainer.innerHTML = "";
    Object.values(factionMap).forEach(cat => {
      const img = document.createElement("img");
      img.src = cat.imageUrl;
      img.alt = cat.displayName;
      slotContainer.style.height = `${settings.imageHeight || "200"}px`;
      slotContainer.style.width = `${settings.imageWidth || "200"}px`;
      img.classList.add("slot-image");
      slotContainer.appendChild(img);
    });

    const factionKeys = Object.keys(factionMap);
    const randomKey = factionKeys[Math.floor(Math.random() * factionKeys.length)];
    const chosenFaction = factionMap[randomKey].displayName;

    await new Promise(resolve => {
      spinSlotMachine(welcomeText, usernameText, "PreviewUser", "PREVIEW-ID", factionMap, streamerId, chosenFaction, resolve);
    });

    return; // Skip live queue listener
  }

  const queueRef = collection(db, `streamers/${streamerId}/queue`);
  const q = query(queueRef, orderBy("timestamp"), limit(1));

  onSnapshot(q, async (querySnapshot) => {
    if (querySnapshot.empty) return;
    if (window.__processingSub) return;

    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();

    window.__processingSub = true;

    await handleViewer(data, streamerId, factionMap, settings);

    await deleteDoc(docSnap.ref);
    window.__processingSub = false;
  });
})();

// Slot Machine Logic
async function spinSlotMachine(welcomeText, usernameText, username, userId, factionMap, streamerId, chosenFaction, callback) {
  const images = document.querySelectorAll(".slot-image");

  // ✅ Hide text initially before spinning starts
  welcomeText.classList.remove("visible");
  usernameText.classList.remove("visible");

  let cycleCount = 0;
  let currentIndex = 0;
  let spinSpeed = 50;
  let slowdownFactor = 1.05;

  function spin() {
    images.forEach(img => img.style.opacity = "0");
    images[currentIndex].style.opacity = "1";

    currentIndex = (currentIndex + 1) % images.length;
    cycleCount++;

    if (cycleCount < 40) {
      spinSpeed *= slowdownFactor;
      setTimeout(spin, spinSpeed);
    } else {
      // ✅ Set text dynamically based on final slot selection
      const finalIndex = Object.values(factionMap).findIndex(cat => cat.displayName === chosenFaction);

      images.forEach(img => img.style.opacity = "0");
      images[finalIndex].style.opacity = "1";


      setTimeout(() => {
        (async () => {
          welcomeText.textContent = `Welcome to ${chosenFaction}`;
          usernameText.textContent = username;

          const matchedCategory = Object.values(factionMap).find(
            cat => cat.displayName === chosenFaction
          );

          if (matchedCategory?.color) {
            welcomeText.style.color = matchedCategory.color;
            usernameText.style.color = matchedCategory.color;
          }
          
          const factionColor = matchedCategory?.color || "#ffd700";

          for (let i = 0; i < 50; i++) {
            const p = document.createElement("div");
            p.classList.add("particle");
            p.style.left = `${50 + (Math.random() * 40 - 20)}%`;
            p.style.top = `${53 + (Math.random() * 20 - 10)}%`;
            p.style.background = factionColor;
            document.getElementById("particle-layer").appendChild(p);
            setTimeout(() => p.remove(), 4000); // cleanup after float
          }

          welcomeText.classList.add("visible");
          usernameText.classList.add("visible");

          // ⏱ Display text for 8s, then fade out, then wait for fade to complete
          setTimeout(() => {
            welcomeText.classList.add("fading-out");
            usernameText.classList.add("fading-out");
            document.querySelector(".slot").classList.add("fading-out");

            setTimeout(async () => {
              if (userId !== "PREVIEW-ID") {
                await fetch("https://api-ljrm742ysq-uc.a.run.app/overlayComplete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ broadcasterId: streamerId, userId, username, faction: chosenFaction, isReturning: false })
                });
              }
              callback(); // 🔔 Only after overlay + fetch
            }, 1000);
          }, 8000);
        })();
      }, 500);
    }
  }

  spin();
}

function showWelcomeBack(welcomeText, usernameText, username, faction) {
  return new Promise(resolve => {
    welcomeText.textContent = `Welcome back to ${faction.displayName}`;
    usernameText.textContent = username;

    const images = document.querySelectorAll(".slot-image");
    images.forEach(img => {
      img.style.opacity = (img.alt === faction.displayName) ? "1" : "0";
    });

    if (faction.color) {
      welcomeText.style.color = faction.color;
      usernameText.style.color = faction.color;
    }

    welcomeText.classList.add("visible");
    usernameText.classList.add("visible");

    setTimeout(() => {
      welcomeText.classList.add("fading-out");
      usernameText.classList.add("fading-out");
      document.querySelector(".slot").classList.add("fading-out");
      setTimeout(resolve, 1000); // wait for fade-out to visually complete
    }, 8000); // wait for display time

    setTimeout(async () => {
      await fetch("https://api-ljrm742ysq-uc.a.run.app/overlayComplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broadcasterId: streamerId,
          userId: userId,
          username: username,
          faction: faction.displayName,
          isReturning: true
        })
      });

      resolve(); // ⏮ Return control after chat message triggers
    }, 1000);
  });
}

async function handleViewer(data, streamerId, factionMap, settings) {
  const slotContainer = document.querySelector(".slot");
  const welcomeText = document.getElementById("welcomeHouse");
  const usernameText = document.getElementById("usernameTag");
  const outlineColor = settings.outlineColor || "#ffffff";
  const outlineWidth = parseInt(settings.outlineWidth || "1");
  const fontClass = `font-${settings.font.toLowerCase().replace(/ /g, "-")}`;
  welcomeText.classList.add(fontClass);
  usernameText.classList.add(fontClass);

  welcomeText.style.marginBottom = `${settings.paddingTop || "20"}px`;
  welcomeText.style.fontSize = `${settings.fontSize || "20"}px`;
  welcomeText.style.fontWeight = `${settings.fontWeight || "400"}`;
  usernameText.style.marginTop = `${settings.paddingBottom || "20"}px`;
  usernameText.style.fontSize = `${settings.fontSize || "20"}px`;
  usernameText.style.fontWeight = `${settings.fontWeight || "400"}`;

  welcomeText.style.textShadow = usernameText.style.textShadow =
    `-${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
     ${outlineWidth}px -${outlineWidth}px 0 ${outlineColor},
     -${outlineWidth}px ${outlineWidth}px 0 ${outlineColor},
     ${outlineWidth}px ${outlineWidth}px 0 ${outlineColor}`;

  // Rebuild slot images
  slotContainer.innerHTML = "";
  Object.values(factionMap).forEach(cat => {
    const img = document.createElement("img");
    img.src = cat.imageUrl;
    img.alt = cat.displayName;
    slotContainer.style.height = `${settings.imageHeight || "200"}px`;
    slotContainer.style.width = `${settings.imageWidth || "200"}px`;
    img.classList.add("slot-image");
    slotContainer.appendChild(img);
  });

  welcomeText.textContent = "";
  usernameText.textContent = "";

  if (data.isReturning) {
    const res = await fetch(`https://api-ljrm742ysq-uc.a.run.app/getViewer?streamerId=${streamerId}&userId=${data.userId}`);
    if (res.ok) {
      const subData = await res.json();
      const faction = factionMap[subData.faction.toLowerCase()];
      await showWelcomeBack(welcomeText, usernameText, data.username, faction);
    }
  } else {
    await new Promise(resolve => {
      spinSlotMachine(welcomeText, usernameText, data.username, data.userId, factionMap, streamerId, data.faction, resolve);
    });
  }
}