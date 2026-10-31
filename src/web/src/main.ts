import { initConnectionTab } from "./tabs/connection";
import { initThemesTab } from "./tabs/themes";
import { initSeasonsTab } from "./tabs/seasons";
import { initOverlaySettingsTab } from "./tabs/overlaySettings";

// Tab navigation
const navButtons = document.querySelectorAll<HTMLButtonElement>(".nav-btn");
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    navButtons.forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.id === `tab-${btn.dataset.tab}`);
    });
  });
});

initConnectionTab();
initThemesTab();
initSeasonsTab();
initOverlaySettingsTab("sorter");
initOverlaySettingsTab("leaderboard");
