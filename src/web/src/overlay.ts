import type { Faction, OverlaySettings, SortEvent, WsServerMessage } from "../../shared/types";

const params = new URLSearchParams(window.location.search);
const isPreview = params.get("preview") === "true";

const stage = document.getElementById("stage") as HTMLDivElement;
const welcomeEl = document.getElementById("welcome") as HTMLDivElement;
const slotEl = document.getElementById("slot") as HTMLImageElement;
const usernameEl = document.getElementById("username") as HTMLDivElement;

let factions: Faction[] = [];
let settings: OverlaySettings = {};
let ws: WebSocket | null = null;
let queue: SortEvent[] = [];
let playing = false;

const DISPLAY_MS = 8000;
const SPIN_STEPS = 40;

async function loadData(): Promise<void> {
  const [themeRes, settingsRes] = await Promise.all([
    fetch("/api/theme").then((r) => r.json()),
    fetch("/api/overlay-settings/sorter").then((r) => r.json())
  ]);
  factions = themeRes.factions ?? [];
  settings = settingsRes.settings ?? {};
  applySettings();
}

function applySettings(): void {
  const font = settings.font || "Inter";
  const size = Number(settings.fontSize || 30);
  const weight = settings.fontWeight || "400";
  const outlineColor = settings.outlineColor || "#FFFFFF";
  const outlineWidth = Number(settings.outlineWidth || 1);
  const shadow = outlineWidth > 0
    ? [
        `-${outlineWidth}px 0 ${outlineColor}`,
        `${outlineWidth}px 0 ${outlineColor}`,
        `0 -${outlineWidth}px ${outlineColor}`,
        `0 ${outlineWidth}px ${outlineColor}`
      ].join(", ")
    : "none";

  for (const el of [welcomeEl, usernameEl]) {
    el.style.fontFamily = `'${font}', sans-serif`;
    el.style.fontSize = `${size}px`;
    el.style.fontWeight = weight;
    el.style.textShadow = shadow;
  }
  welcomeEl.style.marginBottom = `${settings.paddingTop || 20}px`;
  usernameEl.style.marginTop = `${settings.paddingBottom || 20}px`;
  slotEl.style.width = `${settings.imageWidth || 200}px`;
  slotEl.style.height = `${settings.imageHeight || 200}px`;

  if (settings.customCSS) {
    let style = document.getElementById("customCSS");
    if (!style) {
      style = document.createElement("style");
      style.id = "customCSS";
      document.head.appendChild(style);
    }
    style.textContent = settings.customCSS;
  }
}

function connect(): void {
  if (isPreview) return;
  ws = new WebSocket(`ws://${window.location.host}/ws?role=sorter`);
  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data) as WsServerMessage;
    if (msg.type === "sort") {
      queue.push(msg.event);
      void pump();
    } else if (msg.type === "settingsChanged" && msg.overlay === "sorter") {
      window.location.reload();
    }
  };
  ws.onclose = () => setTimeout(connect, 3000);
}

async function pump(): Promise<void> {
  if (playing) return;
  const event = queue.shift();
  if (!event) return;
  playing = true;
  try {
    await playSort(event);
    ws?.send(JSON.stringify({ type: "sortComplete", event }));
  } finally {
    playing = false;
    void pump();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function playSort(event: SortEvent): Promise<void> {
  if (factions.length === 0) await loadData();
  const target = factions.find((f) => f.name.toLowerCase() === event.faction.toLowerCase());
  const color = target?.color || event.factionColor || "#ffffff";
  const images = factions.map((f) => f.imageUrl).filter(Boolean);

  welcomeEl.textContent = `Welcome to ${event.faction}`;
  usernameEl.textContent = event.username;
  welcomeEl.style.color = color;
  usernameEl.style.color = color;
  slotEl.classList.remove("landed");
  stage.classList.add("visible");

  // Slot machine: cycle faction images, slowing down, landing on the target.
  if (images.length > 0) {
    for (let step = 0; step < SPIN_STEPS; step++) {
      slotEl.src = images[step % images.length];
      // Ease out: start fast (40ms), end slow (~250ms).
      const t = step / SPIN_STEPS;
      await sleep(40 + 210 * t * t);
    }
    slotEl.src = target?.imageUrl || images[0];
    slotEl.classList.add("landed");
  }

  spawnParticles(color);
  await sleep(DISPLAY_MS);
  stage.classList.remove("visible");
  await sleep(700);
}

function spawnParticles(color: string): void {
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    const size = 4 + Math.random() * 10;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.background = color;
    particle.style.left = `${Math.random() * 100}vw`;
    particle.style.top = `${60 + Math.random() * 50}vh`;
    particle.style.setProperty("--duration", `${3 + Math.random() * 5}s`);
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 9000);
  }
}

async function previewLoop(): Promise<void> {
  const names = ["PixelPaladin", "StreamSentry", "ChatChampion", "LootLlama", "ByteBard"];
  let i = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (factions.length === 0) await loadData();
    if (factions.length > 0) {
      const faction = factions[Math.floor(Math.random() * factions.length)];
      await playSort({
        username: names[i++ % names.length],
        userId: "preview",
        faction: faction.name,
        factionColor: faction.color,
        isReturning: false
      });
    }
    await sleep(2500);
  }
}

void loadData().then(() => {
  if (isPreview) void previewLoop();
  else connect();
});
