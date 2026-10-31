import { app, BrowserWindow, Menu, shell } from "electron";
import path from "path";
import { openDatabase, getStreamer } from "./db";
import { startLocalServer } from "./server";
import { startEventSub, stopEventSub } from "./twitch/eventsub";
import { setOnLinked, validateToken, refreshAccessToken } from "./twitch/auth";
import { sendChatMessage } from "./twitch/helix";
import { PORT } from "./config";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: "Faction Frenzy",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "web", "favicon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Open external links (Twitch activation page, etc.) in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  mainWindow.on("closed", () => (mainWindow = null));
}

async function bootstrapTwitch(): Promise<void> {
  setOnLinked(async () => {
    startEventSub();
    await sendChatMessage("FactionFrenzy is now enabled in your channel. ⚔️ Let the battle begin!");
  });

  if (!getStreamer()) return;
  const valid = await validateToken();
  if (!valid) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      console.warn("Stored Twitch token could not be refreshed — please reconnect from the app.");
      return;
    }
  }
  startEventSub();
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  openDatabase();
  try {
    await startLocalServer();
  } catch (err) {
    console.error(`Failed to start local server on port ${PORT}:`, err);
    app.quit();
    return;
  }
  void bootstrapTwitch();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopEventSub();
  app.quit();
});
