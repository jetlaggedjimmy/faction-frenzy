import type { Faction, OverlaySettings, WsServerMessage } from "../../shared/types";

const params = new URLSearchParams(window.location.search);
const isPreview = params.get("preview") === "true";

const board = document.getElementById("board") as HTMLDivElement;

let settings: OverlaySettings = {};
let factions: Faction[] = [];
let previousPoints = new Map<string, number>();

// ---------- color helpers ----------

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Darkens very light colors so white text / transparent scenes stay readable. */
function rowBackground(color: string): string {
  try {
    const rgb = hexToRgb(color);
    if (luminance(rgb) > 0.82) {
      const [r, g, b] = rgb.map((c) => Math.round(c * 0.72)) as [number, number, number];
      return `rgb(${r}, ${g}, ${b})`;
    }
    return color;
  } catch {
    return color;
  }
}

function textColorFor(color: string): string {
  try {
    return luminance(hexToRgb(color)) > 0.6 ? "#111111" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

// ---------- rendering ----------

async function loadData(): Promise<void> {
  const [settingsRes, boardRes] = await Promise.all([
    fetch("/api/overlay-settings/leaderboard").then((r) => r.json()),
    fetch("/api/leaderboard").then((r) => r.json())
  ]);
  settings = settingsRes.settings ?? {};
  factions = boardRes.factions ?? [];
  if (isPreview) factions = factions.map((f) => ({ ...f, points: 0 }));
  applyCustomCss();
}

function applyCustomCss(): void {
  if (!settings.customCSS) return;
  let style = document.getElementById("customCSS");
  if (!style) {
    style = document.createElement("style");
    style.id = "customCSS";
    document.head.appendChild(style);
  }
  style.textContent = settings.customCSS;
}

function rowStyle(row: HTMLElement, faction: Faction): void {
  const background = rowBackground(faction.color);
  row.style.background = background;
  row.style.color = textColorFor(faction.color);
  row.style.fontFamily = `'${settings.font || "Inter"}', sans-serif`;
  row.style.fontSize = `${settings.fontSize || 14}px`;
  row.style.fontWeight = settings.fontWeight || "400";
  row.style.width = `${settings.rowWidth || 265}px`;
  row.style.height = `${settings.rowHeight || 50}px`;
  row.style.padding = `${settings.paddingTop || 4}px ${settings.paddingRight || 12}px ${settings.paddingBottom || 4}px ${settings.paddingLeft || 12}px`;
  row.style.borderRadius = `${settings.radiusTopLeft || 4}px ${settings.radiusTopRight || 4}px ${settings.radiusBottomRight || 4}px ${settings.radiusBottomLeft || 4}px`;
}

/** FLIP-animated re-render: rows slide to their new ranking positions. */
function render(updated: Faction[]): void {
  const sorted = [...updated].sort((a, b) => b.points - a.points);

  // First: capture current positions
  const oldPositions = new Map<string, DOMRect>();
  board.querySelectorAll<HTMLElement>(".frow").forEach((row) => {
    oldPositions.set(row.dataset.name!, row.getBoundingClientRect());
  });

  board.replaceChildren();
  for (const faction of sorted) {
    const row = document.createElement("div");
    row.className = "frow";
    row.dataset.name = faction.name;
    rowStyle(row, faction);

    const img = document.createElement("img");
    img.src = faction.imageUrl || "/img/default.png";
    img.onerror = () => (img.src = "/img/default.png");
    img.style.width = `${settings.imageWidth || 100}px`;
    img.style.height = `${settings.imageHeight || 50}px`;

    const name = document.createElement("span");
    name.className = "fname";
    name.textContent = faction.name;

    const pts = document.createElement("span");
    pts.className = "fpts";
    pts.textContent = `${faction.points} pts`;

    row.append(img, name, pts);
    board.appendChild(row);

    // Bump animation when this faction gained points
    const before = previousPoints.get(faction.name);
    if (before !== undefined && faction.points > before) {
      row.classList.add("bump");
      setTimeout(() => row.classList.remove("bump"), 900);
    }
  }

  // Last + Invert + Play: slide from old to new position
  board.querySelectorAll<HTMLElement>(".frow").forEach((row) => {
    const old = oldPositions.get(row.dataset.name!);
    if (!old) return;
    const current = row.getBoundingClientRect();
    const dx = old.left - current.left;
    const dy = old.top - current.top;
    if (dx || dy) {
      row.style.transition = "none";
      row.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        row.style.transition = "transform 0.6s ease";
        row.style.transform = "";
      });
    }
  });

  previousPoints = new Map(sorted.map((f) => [f.name, f.points]));
  factions = sorted;
}

// ---------- live updates ----------

function connect(): void {
  const ws = new WebSocket(`ws://${window.location.host}/ws?role=leaderboard`);
  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data) as WsServerMessage;
    if (msg.type === "leaderboard") render(msg.factions);
    else if (msg.type === "settingsChanged" && msg.overlay === "leaderboard") window.location.reload();
  };
  ws.onclose = () => setTimeout(connect, 3000);
}

function previewLoop(): void {
  setInterval(() => {
    if (factions.length === 0) return;
    const target = factions[Math.floor(Math.random() * factions.length)];
    render(factions.map((f) =>
      f.name === target.name ? { ...f, points: f.points + Math.ceil(Math.random() * 50) } : f
    ));
  }, 2000);
}

void loadData().then(() => {
  render(factions);
  if (isPreview) previewLoop();
  else connect();
});
