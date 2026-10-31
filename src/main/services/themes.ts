import fs from "fs";
import path from "path";
import * as db from "../db";
import { WEB_ROOT } from "../config";
import type { Theme } from "../../shared/types";

let presetCache: Theme[] | null = null;

export function getPresetThemes(): Theme[] {
  if (!presetCache) {
    const file = path.join(WEB_ROOT, "presets.json");
    presetCache = JSON.parse(fs.readFileSync(file, "utf8")) as Theme[];
  }
  return presetCache;
}

export function getThemeById(themeId: string): Theme | null {
  const preset = getPresetThemes().find((t) => t.id === themeId);
  if (preset) return preset;
  return db.getCustomTheme(themeId);
}
