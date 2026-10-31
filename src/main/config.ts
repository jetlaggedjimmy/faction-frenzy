import path from "path";

/** Port for the local control panel, API and OBS overlay URLs. */
export const PORT = Number(process.env.FACTION_FRENZY_PORT ?? 4770);

/** Root of the built web assets (control panel, overlays, images, presets.json). */
export const WEB_ROOT = path.join(__dirname, "..", "web");
