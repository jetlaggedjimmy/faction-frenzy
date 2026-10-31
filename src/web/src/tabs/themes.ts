import type { Faction, Theme } from "../../../shared/types";
import { api } from "../api";
import { el, toast } from "../ui";

type EditableFaction = Omit<Faction, "points">;

const DEFAULT_CUSTOM: EditableFaction[] = [
  { name: "Custom Faction 1", color: "#ff9999", imageUrl: "" },
  { name: "Custom Faction 2", color: "#99ccff", imageUrl: "" },
  { name: "Custom Faction 3", color: "#99ff99", imageUrl: "" },
  { name: "Custom Faction 4", color: "#ffff99", imageUrl: "" }
];

let factions: EditableFaction[] = [];
let selectedThemeId: string | null = null;

const $ = (id: string) => document.getElementById(id)!;

/** Renders preset + custom theme tiles into a grid; invokes onPick when selected. */
export async function renderThemeTiles(
  grid: HTMLElement,
  onPick: (theme: Theme | null) => void,
  options: { showCustomCreator?: boolean; showDelete?: boolean } = {}
): Promise<void> {
  const { presets, custom } = await api.getThemes();
  grid.replaceChildren();

  const addTile = (theme: Theme | null) => {
    const tile = el("div", { class: "theme-tile" });
    if (theme) {
      if (theme.custom) {
        tile.appendChild(el("span", { class: "t-badge" }, theme.sourcePresetId ? "Preset" : "Custom"));
        if (options.showDelete) {
          const del = el("button", { class: "t-delete", title: "Delete theme" }, "✕");
          del.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete theme "${theme.name}"?`)) return;
            await api.deleteCustomTheme(theme.id);
            toast("Theme deleted");
            void renderThemeTiles(grid, onPick, options);
          });
          tile.appendChild(del);
        }
      }
      const img = el("img", { src: theme.logo || "/img/default.png", alt: "" }) as HTMLImageElement;
      img.onerror = () => (img.src = "/img/default.png");
      tile.appendChild(img);
      tile.appendChild(el("div", { class: "t-name" }, theme.name));
    } else {
      tile.appendChild(el("img", { src: "/img/plus.png", alt: "" }));
      tile.appendChild(el("div", { class: "t-name" }, "Create my own Factions"));
    }
    tile.addEventListener("click", () => {
      grid.querySelectorAll(".theme-tile").forEach((t) => t.classList.remove("selected"));
      tile.classList.add("selected");
      onPick(theme);
    });
    grid.appendChild(tile);
  };

  for (const theme of custom) addTile(theme);
  for (const theme of presets) addTile(theme);
  if (options.showCustomCreator !== false) addTile(null);
}

function renderFactionEditor(): void {
  const list = $("factionList");
  list.replaceChildren();

  factions.forEach((faction, index) => {
    const img = el("img", { src: faction.imageUrl || "/img/default.png", alt: "" }) as HTMLImageElement;
    img.onerror = () => (img.src = "/img/default.png");

    const nameInput = el("input", { type: "text", value: faction.name, placeholder: "Faction name" }) as HTMLInputElement;
    nameInput.addEventListener("input", () => (faction.name = nameInput.value));

    const colorInput = el("input", { type: "color", value: faction.color }) as HTMLInputElement;
    colorInput.addEventListener("input", () => (faction.color = colorInput.value));

    const urlInput = el("input", { type: "text", value: faction.imageUrl, placeholder: "Image URL" }) as HTMLInputElement;
    urlInput.addEventListener("input", () => {
      faction.imageUrl = urlInput.value;
      img.src = faction.imageUrl || "/img/default.png";
    });

    const remove = el("button", { class: "f-remove", title: "Remove faction" }, "✕");
    remove.addEventListener("click", () => {
      factions.splice(index, 1);
      renderFactionEditor();
    });

    list.appendChild(el("div", { class: "faction-row" }, img, nameInput, colorInput, urlInput, remove));
  });
}

function validFactions(): EditableFaction[] | null {
  const cleaned = factions
    .map((f) => ({ name: f.name.trim(), color: f.color, imageUrl: f.imageUrl.trim() }))
    .filter((f) => f.name);
  if (cleaned.length === 0) {
    toast("Add at least one faction with a name", true);
    return null;
  }
  const names = new Set(cleaned.map((f) => f.name.toLowerCase()));
  if (names.size !== cleaned.length) {
    toast("Faction names must be unique", true);
    return null;
  }
  return cleaned;
}

export function initThemesTab(): void {
  void renderThemeTiles(
    $("themeGrid"),
    async (theme) => {
      if (theme) {
        const details = await api.getThemeDetails(theme.id);
        factions = details.factions.map((f) => ({ ...f }));
        selectedThemeId = theme.id;
      } else {
        factions = DEFAULT_CUSTOM.map((f) => ({ ...f }));
        selectedThemeId = null;
      }
      renderFactionEditor();
    },
    { showDelete: true }
  );

  // Start from the currently active factions.
  void api.getTheme().then(({ factions: active }) => {
    factions = active.map(({ name, color, imageUrl }) => ({ name, color, imageUrl }));
    renderFactionEditor();
  });

  $("addFactionBtn").addEventListener("click", () => {
    factions.push({ name: `Faction ${factions.length + 1}`, color: "#9146ff", imageUrl: "" });
    renderFactionEditor();
  });

  $("applyThemeBtn").addEventListener("click", async () => {
    const cleaned = validFactions();
    if (!cleaned) return;
    try {
      await api.applyTheme(cleaned);
      toast("⚔️ Theme applied — the battle begins!");
    } catch (err: any) {
      toast(err.message, true);
    }
  });

  $("saveCustomBtn").addEventListener("click", async () => {
    const cleaned = validFactions();
    if (!cleaned) return;
    const name = prompt("Name for this custom theme:");
    if (!name?.trim()) return;
    try {
      await api.saveCustomTheme(name.trim(), cleaned, selectedThemeId);
      toast("Custom theme saved");
      void renderThemeTiles($("themeGrid"), async (theme) => {
        if (theme) {
          const details = await api.getThemeDetails(theme.id);
          factions = details.factions.map((f) => ({ ...f }));
          selectedThemeId = theme.id;
        } else {
          factions = DEFAULT_CUSTOM.map((f) => ({ ...f }));
          selectedThemeId = null;
        }
        renderFactionEditor();
      }, { showDelete: true });
    } catch (err: any) {
      toast(err.message, true);
    }
  });
}
