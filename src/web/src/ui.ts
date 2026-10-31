let toastTimer: number | undefined;

export function toast(message: string, isError = false): void {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = isError ? "toast error show" : "toast show";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 3000);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

export function copyToClipboard(text: string, label: string): void {
  void navigator.clipboard.writeText(text).then(
    () => toast(`${label} copied to clipboard`),
    () => toast("Could not copy to clipboard", true)
  );
}

export const OVERLAY_FONTS = [
  "Inter", "Merriweather", "Roboto", "Playfair Display", "Open Sans", "Lobster",
  "Bebas Neue", "Ubuntu", "Abril Fatface", "Alfa Slab One", "Barriecito", "Bangers",
  "Luckiest Guy", "Damion", "Rubik Wet Paint", "Poetsen One", "Crafty Girls",
  "Orbitron", "Press Start 2P", "Monoton", "Syncopate", "Pacifico", "DynaPuff",
  "Fascinate", "Limelight"
];
