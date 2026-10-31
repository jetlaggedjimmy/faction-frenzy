import type { Faction, OverlaySettings, WsServerMessage } from "../../shared/types";

const params = new URLSearchParams(window.location.search);
const isPreview = params.get("preview") === "true";

const board = document.getElementById("board") as HTMLDivElement;

type Layout = "vertical" | "horizontal" | "ticker";

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

function layout(): Layout {
  const value = settings.layout;
  return value === "horizontal" || value === "ticker" ? value : "vertical";
}

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

const deltaTimers = new WeakMap<HTMLElement, number>();

/** Shows the +N badge on a row, restarting the animation if one is in flight. */
function showDelta(row: HTMLElement, delta: number): void {
  const badge = row.querySelector<HTMLElement>(".delta");
  if (!badge) return;
  badge.textContent = `+${delta}`;
  badge.classList.remove("show");
  row.classList.remove("bump");
  void badge.offsetWidth; // force reflow so the CSS animation restarts
  badge.classList.add("show");
  row.classList.add("bump");
  const pending = deltaTimers.get(row);
  if (pending) window.clearTimeout(pending);
  deltaTimers.set(row, window.setTimeout(() => {
    badge.classList.remove("show");
    badge.textContent = "";
    row.classList.remove("bump");
  }, 1900));
}

function buildRow(faction: Faction, delta: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "frow";
  row.dataset.name = faction.name;
  row.style.background = rowBackground(faction.color);
  row.style.color = textColorFor(faction.color);
  row.style.fontFamily = `'${settings.font || "Inter"}', sans-serif`;
  row.style.fontSize = `${settings.fontSize || 14}px`;
  row.style.fontWeight = settings.fontWeight || "400";
  row.style.height = `${settings.rowHeight || 50}px`;
  // Ticker rows size to their content; list rows use the configured width.
  if (layout() !== "ticker") row.style.width = `${settings.rowWidth || 265}px`;

  const img = document.createElement("img");
  img.src = faction.imageUrl || "/img/default.png";
  img.onerror = () => (img.src = "/img/default.png");
  img.style.width = `${settings.imageWidth || 100}px`;
  img.style.height = `${settings.imageHeight || 50}px`;

  const name = document.createElement("span");
  name.className = "fname";
  name.textContent = faction.name;

  // Always present so the row width never changes when a delta appears.
  const badge = document.createElement("span");
  badge.className = "delta";

  const pts = document.createElement("span");
  pts.className = "fpts";
  pts.textContent = `${faction.points} pts`;

  row.append(img, name, badge, pts);

  if (delta > 0) showDelta(row, delta);
  return row;
}

function render(updated: Faction[]): void {
  const mode = layout();
  // Ticker keeps its configured order and scrolls steadily; lists rank by points.
  const ordered = mode === "ticker" ? [...updated] : [...updated].sort((a, b) => b.points - a.points);
  const deltas = new Map(ordered.map((f) => {
    const before = previousPoints.get(f.name);
    return [f.name, before === undefined ? 0 : f.points - before] as const;
  }));

  board.classList.toggle("horizontal", mode === "horizontal");
  board.classList.toggle("ticker", mode === "ticker");

  if (mode === "ticker") renderTicker(ordered, deltas);
  else renderList(ordered, deltas);

  previousPoints = new Map(ordered.map((f) => [f.name, f.points]));
  factions = ordered;
}

/** FLIP-animated list: rows slide to their new ranking positions. */
function renderList(sorted: Faction[], deltas: Map<string, number>): void {
  const oldPositions = new Map<string, DOMRect>();
  board.querySelectorAll<HTMLElement>(".frow").forEach((row) => {
    oldPositions.set(row.dataset.name!, row.getBoundingClientRect());
  });

  board.replaceChildren(...sorted.map((f) => buildRow(f, deltas.get(f.name) ?? 0)));

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
}

/**
 * Endless marquee: two copies of the board scroll left at a constant speed.
 * Updates happen in place so the scroll animation never restarts.
 */
function renderTicker(ordered: Faction[], deltas: Map<string, number>): void {
  const key = ordered.map((f) => `${f.name}|${f.imageUrl}|${f.color}`).join("\u0000");
  const existing = board.querySelector<HTMLElement>(".track");

  if (existing && existing.dataset.key === key) {
    for (const faction of ordered) {
      const delta = deltas.get(faction.name) ?? 0;
      existing.querySelectorAll<HTMLElement>(`.frow[data-name="${CSS.escape(faction.name)}"]`).forEach((row) => {
        row.querySelector<HTMLElement>(".fpts")!.textContent = `${faction.points} pts`;
        if (delta > 0) showDelta(row, delta);
      });
    }
    return;
  }

  const track = document.createElement("div");
  track.className = "track";
  track.dataset.key = key;
  for (const copy of [0, 1]) {
    const half = document.createElement("div");
    half.className = "half";
    if (copy === 1) half.setAttribute("aria-hidden", "true");
    half.append(...ordered.map((f) => buildRow(f, deltas.get(f.name) ?? 0)));
    track.appendChild(half);
  }
  board.replaceChildren(track);

  // Duration depends on content width so the speed setting is in px/second.
  requestAnimationFrame(() => {
    const speed = Math.max(Number(settings.scrollSpeed) || 40, 5);
    track.style.animationDuration = `${track.scrollWidth / 2 / speed}s`;
  });
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
