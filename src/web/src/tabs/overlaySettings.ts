import type { OverlayKind, OverlaySettings } from "../../../shared/types";
import { api } from "../api";
import { el, OVERLAY_FONTS, toast } from "../ui";

interface FieldDef {
  key: string;
  label: string;
  type: "select" | "number" | "color" | "css";
  options?: [value: string, label: string][];
  hint?: string;
}

const FONT_OPTIONS: [string, string][] = OVERLAY_FONTS.map((f) => [f, f]);

const SORTER_FIELDS: FieldDef[] = [
  { key: "font", label: "Font", type: "select", options: FONT_OPTIONS },
  { key: "fontSize", label: "Font size (px)", type: "number" },
  { key: "fontWeight", label: "Font weight", type: "number" },
  { key: "outlineColor", label: "Outline color", type: "color" },
  { key: "outlineWidth", label: "Outline width (px)", type: "number" },
  { key: "imageWidth", label: "Image width (px)", type: "number" },
  { key: "imageHeight", label: "Image height (px)", type: "number" },
  { key: "paddingTop", label: "Space below welcome (px)", type: "number" },
  { key: "paddingBottom", label: "Space above username (px)", type: "number" },
  { key: "customCSS", label: "Custom CSS", type: "css" }
];

const LEADERBOARD_FIELDS: FieldDef[] = [
  {
    key: "layout",
    label: "Layout",
    type: "select",
    options: [
      ["vertical", "Vertical list"],
      ["horizontal", "Horizontal row"],
      ["ticker", "Scrolling ticker"]
    ]
  },
  { key: "font", label: "Font", type: "select", options: FONT_OPTIONS },
  { key: "fontSize", label: "Font size (px)", type: "number" },
  { key: "fontWeight", label: "Font weight", type: "number" },
  { key: "imageWidth", label: "Image width (px)", type: "number" },
  { key: "imageHeight", label: "Image height (px)", type: "number" },
  { key: "rowWidth", label: "Row width (px)", type: "number" },
  { key: "rowHeight", label: "Row height (px)", type: "number" },
  { key: "scrollSpeed", label: "Ticker speed (px/s)", type: "number" },
  {
    key: "customCSS",
    label: "Custom CSS",
    type: "css",
    hint: "Fine-tune spacing, rounding, colors and more. Hooks: #board (container), " +
      ".frow (row), .fname (name), .fpts (points), .delta (the +N badge). " +
      "Example: .frow { border-radius: 12px; padding: 6px 16px; }"
  }
];

export function initOverlaySettingsTab(overlay: OverlayKind): void {
  const form = document.getElementById(`${overlay}Form`) as HTMLElement;
  const fields = overlay === "sorter" ? SORTER_FIELDS : LEADERBOARD_FIELDS;
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();

  // Debounced auto-save: the server broadcasts the change, which reloads
  // live overlays and the preview iframe over the WebSocket.
  let saveTimer: number | undefined;
  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      const updated: OverlaySettings = {};
      for (const [key, control] of inputs) updated[key] = control.value;
      try {
        await api.saveOverlaySettings(overlay, updated);
      } catch (err: any) {
        toast(err.message, true);
      }
    }, 500);
  };

  function buildForm(settings: OverlaySettings): void {
    form.replaceChildren(el("h3", {}, "Settings"));
    inputs.clear();

    const numberGrid = el("div", { class: "two-col" });
    for (const field of fields) {
      let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (field.type === "select") {
        const select = el("select");
        for (const [value, label] of field.options ?? []) {
          const option = el("option", { value }, label) as HTMLOptionElement;
          option.selected = settings[field.key] === value;
          select.appendChild(option);
        }
        control = select;
      } else if (field.type === "css") {
        control = el("textarea", { placeholder: "/* Additional CSS injected into the overlay */" }) as HTMLTextAreaElement;
        control.value = settings[field.key] ?? "";
      } else {
        control = el("input", {
          type: field.type === "color" ? "color" : "number",
          value: settings[field.key] ?? ""
        }) as HTMLInputElement;
      }
      inputs.set(field.key, control);
      control.addEventListener("input", scheduleSave);
      const wrapper = el("label", {}, field.label, control);
      if (field.type === "number") {
        if (!numberGrid.parentElement) form.appendChild(numberGrid);
        numberGrid.appendChild(wrapper);
      } else {
        form.appendChild(wrapper);
      }
      if (field.hint) form.appendChild(el("p", { class: "hint" }, field.hint));
    }

    const reset = el("button", { class: "btn" }, "Restore defaults");
    reset.addEventListener("click", async () => {
      if (!confirm("Restore the default settings?")) return;
      window.clearTimeout(saveTimer);
      await api.resetOverlaySettings(overlay);
      toast("Settings restored to defaults");
      const { settings: fresh } = await api.getOverlaySettings(overlay);
      buildForm(fresh);
    });

    form.appendChild(el("div", { class: "row" }, reset));
    form.appendChild(el("p", { class: "hint" }, "Changes are saved and applied automatically."));
  }

  void api.getOverlaySettings(overlay).then(({ settings }) => buildForm(settings));
}
