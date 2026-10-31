import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src/web",
  base: "./",
  publicDir: "public",
  build: {
    outDir: resolve(__dirname, "dist/web"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/web/index.html"),
        overlay: resolve(__dirname, "src/web/overlay.html"),
        leaderboard: resolve(__dirname, "src/web/leaderboard.html")
      }
    }
  }
});
