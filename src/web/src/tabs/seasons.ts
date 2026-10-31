import type { Season, Theme } from "../../../shared/types";
import { api } from "../api";
import { toast } from "../ui";
import { renderThemeTiles } from "./themes";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);

interface SlotRefs {
  themeName: string;
  factionsHint: string;
}

const slots: Record<"current" | "next", SlotRefs> = {
  current: { themeName: "curThemeName", factionsHint: "curFactions" },
  next: { themeName: "nextThemeName", factionsHint: "nextFactions" }
};

let seasons: { current: Season | null; next: Season | null } = { current: null, next: null };

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function renderCountdown(season: Season | null): void {
  const pill = $("seasonCountdown");
  if (!season) {
    pill.textContent = "";
    return;
  }
  if (season.isOngoing || !season.endDate) {
    pill.textContent = "Ongoing";
    return;
  }
  const msLeft = new Date(season.endDate).getTime() - Date.now();
  pill.textContent = msLeft <= 0 ? "Season ended" : `${Math.ceil(msLeft / 86_400_000)} days left`;
}

async function renderSlotTheme(slot: "current" | "next", season: Season | null): Promise<void> {
  const refs = slots[slot];
  $(refs.themeName).textContent = season?.theme || "None";
  $(refs.factionsHint).textContent = "";
  if (season?.themeId) {
    try {
      const details = await api.getThemeDetails(season.themeId);
      $(refs.factionsHint).textContent = `Factions: ${details.factions.map((f) => f.name).join(", ")}`;
    } catch {
      // theme may have been deleted — leave the hint empty
    }
  }
}

function readSeasonForm(slot: "current" | "next"): Season {
  const existing = seasons[slot] ?? {};
  if (slot === "current") {
    const isOngoing = input("curOngoing").checked;
    return {
      ...existing,
      name: input("curName").value.trim(),
      endDate: isOngoing ? null : fromLocalInput(input("curEnd").value),
      isOngoing,
      reward: input("curReward").value.trim()
    };
  }
  return {
    ...existing,
    name: input("nextName").value.trim(),
    startDate: fromLocalInput(input("nextStart").value),
    reward: input("nextReward").value.trim()
  };
}

function fillForms(): void {
  const { current, next } = seasons;
  input("curName").value = current?.name ?? "";
  input("curEnd").value = toLocalInput(current?.endDate);
  input("curOngoing").checked = !!current?.isOngoing;
  input("curReward").value = current?.reward ?? "";
  input("nextName").value = next?.name ?? "";
  input("nextStart").value = toLocalInput(next?.startDate);
  input("nextReward").value = next?.reward ?? "";
  renderCountdown(current);
  void renderSlotTheme("current", current);
  void renderSlotTheme("next", next);
}

function openThemePicker(onPick: (theme: Theme) => void): void {
  const modal = $("themeModal");
  modal.classList.remove("hidden");
  void renderThemeTiles(
    $("modalThemeGrid"),
    (theme) => {
      if (!theme) return;
      modal.classList.add("hidden");
      onPick(theme);
    },
    { showCustomCreator: false }
  );
}

async function pickThemeFor(slot: "current" | "next"): Promise<void> {
  openThemePicker(async (theme) => {
    const season = { ...readSeasonForm(slot), theme: theme.name, themeId: theme.id };
    seasons[slot] = season;
    await api.saveSeason(slot, season);
    toast(`Theme "${theme.name}" set for the ${slot} season`);
    void renderSlotTheme(slot, season);
  });
}

export function initSeasonsTab(): void {
  void api.getSeasons().then((state) => {
    seasons = state;
    fillForms();
  });

  $("curPickTheme").addEventListener("click", () => void pickThemeFor("current"));
  $("nextPickTheme").addEventListener("click", () => void pickThemeFor("next"));
  $("modalClose").addEventListener("click", () => $("themeModal").classList.add("hidden"));

  $("saveCurBtn").addEventListener("click", async () => {
    const season = readSeasonForm("current");
    if (!season.name) return toast("Give the season a name", true);
    seasons.current = season;
    await api.saveSeason("current", season);
    renderCountdown(season);
    toast("Current season saved");
  });

  $("saveNextBtn").addEventListener("click", async () => {
    const season = readSeasonForm("next");
    if (!season.name) return toast("Give the season a name", true);
    seasons.next = season;
    await api.saveSeason("next", season);
    toast("Next season scheduled");
  });

  $("archiveBtn").addEventListener("click", async () => {
    if (!seasons.current) return toast("There is no current season to archive", true);
    if (!confirm("Archive the current season and promote the next one?")) return;

    const { factions } = await api.getLeaderboard();
    const archiveData = {
      season: seasons.current,
      results: [...factions].sort((a, b) => b.points - a.points),
      archivedAt: new Date().toISOString()
    };
    const { promoted } = await api.archiveSeason(archiveData);

    if (promoted) {
      // Apply the promoted season's theme as the active factions.
      const state = await api.getSeasons();
      seasons = state;
      if (state.current?.themeId) {
        try {
          const details = await api.getThemeDetails(state.current.themeId);
          await api.applyTheme(details.factions);
          toast("Season promoted and its theme applied ⚔️");
        } catch {
          toast("Season promoted — set the theme manually on the Themes tab", true);
        }
      } else {
        toast("Season promoted");
      }
    } else {
      seasons = await api.getSeasons();
      toast("Season archived — no next season was scheduled", true);
    }
    fillForms();
  });
}
