let getStreamerProfile;
async function loadStreamerContext() {
  if (!getStreamerProfile) {
    const mod = await import('./streamerContext.js');
    getStreamerProfile = mod.getStreamerProfile;
  }
  return getStreamerProfile();
}
document.addEventListener("DOMContentLoaded", async () => {
  await initUser();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("twitchBroadcasterId");
      localStorage.removeItem("twitchUser");
      setTimeout(() => {
        window.location.href = "https://factionfrenzy.gg";
      }, 50);
    });
  }

  // 🔥 Automatically select the Themes tab on load
  const defaultTab = document.querySelector('[data-tab="theme"]');
  if (defaultTab) defaultTab.click();
});

const tabButtons = document.querySelectorAll('.tab-bar button');
const adminContent = document.getElementById('adminContent');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Remove active from all
    tabButtons.forEach(b => b.classList.remove('active'));

    // Add to clicked one
    btn.classList.add('active');

    const view = btn.dataset.tab;
    loadView(view);
  });
});

async function loadView(viewName) {
  // Load HTML into the container
  const htmlRes = await fetch(`${viewName}.html`);
  const html = await htmlRes.text();
  document.getElementById("adminContent").innerHTML = html;

  // Check if script is already loaded
  if (!window[`init${toPascal(viewName)}View`]) {
    const script = document.createElement("script");
    script.src = `${viewName}.js`;
    script.onload = () => {
      const initFn = window[`init${toPascal(viewName)}View`];
      if (typeof initFn === "function") initFn();
    };
    document.body.appendChild(script);
  } else {
    // Already loaded? Just run it again
    window[`init${toPascal(viewName)}View`]();
  }
}
function toPascal(str) {
  return str.replace(/(^\w|-\w)/g, s => s.replace('-', '').toUpperCase());
}

async function initUser() {
  try {
    const profile = await loadStreamerContext();
    const broadcasterId = profile.id;
    const username = profile.login || profile.displayName;
    const displayName = profile.displayName;
    const profileImageUrl = profile.profileImageUrl;
    localStorage.setItem("twitchBroadcasterId", broadcasterId);
    localStorage.setItem("twitchUser", username);
    localStorage.setItem("twitchDisplayName", displayName);
    window.twitchUsername = username;
    document.getElementById("userDisplay").textContent = displayName;
    document.getElementById("userAvatar").src = profileImageUrl;
    document.getElementById("userAvatar").style.display = "inline-block";
    document.getElementById("userDisplay").style.display = "inline";
    document.getElementById("logoutBtn").style.display = "inline-block";
    document.getElementById("loginBtn").style.display = "none";
  } catch (err) {
    console.error('Failed to fetch streamer profile:', err);
    // Optionally show error UI
  }
}