import express from "express";
import { createServer, type Server } from "http";
import { PORT, WEB_ROOT } from "../config";
import { createApiRouter } from "./api";
import { initHub } from "./hub";

/** Starts the local HTTP + WebSocket server that powers the UI and OBS overlays. */
export function startLocalServer(): Promise<Server> {
  const app = express();
  app.use(express.json());
  app.use("/api", createApiRouter());
  app.use(express.static(WEB_ROOT));

  const server = createServer(app);
  initHub(server);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`🚀 Faction Frenzy local server running at http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}
