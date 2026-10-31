import { api, type AppStatus } from "../api";
import { copyToClipboard, toast } from "../ui";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function show(id: string, visible: boolean): void {
  $(id).classList.toggle("hidden", !visible);
}

function renderStatus(status: AppStatus): void {
  const { auth, eventsub, profile } = status;

  show("authUnlinked", auth.status === "unlinked");
  show("authPending", auth.status === "pending");
  show("authLinked", auth.status === "linked");
  show("authError", auth.status === "error");

  if (auth.status === "pending") {
    $("userCode").textContent = auth.userCode;
    const link = $<HTMLAnchorElement>("verifyLink");
    link.href = auth.verificationUri;
    link.textContent = auth.verificationUri;
  }
  if (auth.status === "linked") {
    $("linkedName").textContent = auth.displayName;
    $("eventsubState").textContent =
      eventsub.state + (eventsub.error ? ` (${eventsub.error})` : "");
  }
  if (auth.status === "error") $("authErrorMsg").textContent = auth.message;

  const badge = $("connBadge");
  if (auth.status === "linked" && eventsub.state === "connected") {
    badge.textContent = `Connected · ${profile?.displayName ?? ""}`;
    badge.className = "badge ok";
  } else if (auth.status === "linked") {
    badge.textContent = `Linked · events ${eventsub.state}`;
    badge.className = "badge";
  } else {
    badge.textContent = "Not connected to Twitch";
    badge.className = "badge bad";
  }

  show("profileBox", !!profile);
  if (profile) {
    $("profileName").textContent = profile.displayName;
    if (profile.profileImageUrl) $<HTMLImageElement>("profileAvatar").src = profile.profileImageUrl;
  }

  const clientIdInput = $<HTMLInputElement>("clientIdInput");
  if (status.clientIdSet && !clientIdInput.value) clientIdInput.placeholder = "Client ID saved ✓";
}

async function refresh(): Promise<void> {
  try {
    renderStatus(await api.status());
  } catch {
    $("connBadge").textContent = "Local server unreachable";
    $("connBadge").className = "badge bad";
  }
}

export function initConnectionTab(): void {
  const origin = window.location.origin;
  $("sorterUrl").textContent = `${origin}/overlay.html`;
  $("leaderboardUrl").textContent = `${origin}/leaderboard.html`;

  $("copySorterUrl").addEventListener("click", () =>
    copyToClipboard(`${origin}/overlay.html`, "Sorter overlay URL"));
  $("copyLeaderboardUrl").addEventListener("click", () =>
    copyToClipboard(`${origin}/leaderboard.html`, "Leaderboard overlay URL"));

  $("saveClientIdBtn").addEventListener("click", async () => {
    const clientId = $<HTMLInputElement>("clientIdInput").value.trim();
    if (!clientId) return toast("Enter your Twitch Client ID first", true);
    try {
      await api.saveClientId(clientId);
      toast("Client ID saved");
      void refresh();
    } catch (err: any) {
      toast(err.message, true);
    }
  });

  const connect = async () => {
    try {
      await api.authStart();
      void refresh();
    } catch (err: any) {
      toast(err.message, true);
    }
  };
  $("connectBtn").addEventListener("click", connect);
  $("retryConnectBtn").addEventListener("click", connect);

  $("disconnectBtn").addEventListener("click", async () => {
    await api.logout();
    toast("Disconnected from Twitch");
    void refresh();
  });

  $("restartEventSubBtn").addEventListener("click", async () => {
    await api.restartEventSub();
    toast("Reconnecting to Twitch events…");
    setTimeout(() => void refresh(), 1500);
  });

  $("testSortBtn").addEventListener("click", async () => {
    try {
      const result = await api.testSort();
      toast(`Test viewer sorted into ${result.faction}`);
    } catch (err: any) {
      toast(err.message, true);
    }
  });

  void refresh();
  setInterval(() => void refresh(), 3000);
}
