import type { OverlayKind, OverlaySettings } from "../../../shared/types";
import { api } from "../api";
import { el, OVERLAY_FONTS, toast } from "../ui";

interface FieldDef {
  key: string;
  label: string;
  type: "font" | "number" | "color" | "css";
}

const SORTER_FIELDS: FieldDef[] = [
  { key: "font", label: "Font", type: "font" },
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
  { key: "font", label: "Font", type: "font" },
  { key: "fontSize", label: "Font size (px)", type: "number" },
  { key: "fontWeight", label: "Font weight", type: "number" },
  { key: "imageWidth", label: "Image width (px)", type: "number" },
  { key: "imageHeight", label: "Image height (px)", type: "number" },
  { key: "rowWidth", label: "Row width (px)", type: "number" },
  { key: "rowHeight", label: "Row height (px)", type: "number" },
  { key: "paddingTop", label: "Padding top (px)", type: "number" },
  { key: "paddingRight", label: "Padding right (px)", type: "number" },
  { key: "paddingBottom", label: "Padding bottom (px)", type: "number" },
  { key: "paddingLeft", label: "Padding left (px)", type: "number" },
  { key: "radiusTopLeft", label: "Radius top-left (px)", type: "number" },
  { key: "radiusTopRight", label: "Radius top-right (px)", type: "number" },
  { key: "radiusBottomRight", label: "Radius bottom-right (px)", type: "number" },
  { key: "radiusBottomLeft", label: "Radius bottom-left (px)", type: "number" },
  { key: "customCSS", label: "Custom CSS", type: "css" }
];

export function initOverlaySettingsTab(overlay: OverlayKind): void {
  const form = document.getElementById(`${overlay}Form`) as HTMLElement;
  const preview = document.getElementById(`${overlay}Preview`) as HTMLIFrameElement;
  const fields = overlay === "sorter" ? SORTER_FIELDS : LEADERBOARD_FIELDS;
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();

  const reloadPreview = () => {
    preview.src = preview.src.split("#")[0];
  };

  function buildForm(settings: OverlaySettings): void {
    form.replaceChildren(el("h3", {}, "Settings"));
    inputs.clear();

    const numberGrid = el("div", { class: "two-col" });
    for (const field of fields) {
      let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (field.type === "font") {
        const select = el("select");
        for (const font of OVERLAY_FONTS) {
          const option = el("option", { value: font }, font) as HTMLOptionElement;
          option.selected = settings[field.key] === font;
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
      const wrapper = el("label", {}, field.label, control);
      if (field.type === "number") numberGrid.appendChild(wrapper);
      else form.appendChild(wrapper);
      if (field.type === "font") form.appendChild(numberGrid);
    }

    const save = el("button", { class: "btn primary" }, "💾 Save settings");
    save.addEventListener("click", async () => {
      const updated: OverlaySettings = {};
      for (const [key, control] of inputs) updated[key] = control.value;
      try {
        await api.saveOverlaySettings(overlay, updated);
        toast("Settings saved");
        reloadPreview();
      } catch (err: any) {
        toast(err.message, true);
      }
    });

    const reset = el("button", { class: "btn" }, "Restore defaults");
    reset.addEventListener("click", async () => {
      if (!confirm("Restore the default settings?")) return;
      await api.resetOverlaySettings(overlay);
      toast("Settings restored to defaults");
      const { settings: fresh } = await api.getOverlaySettings(overlay);
      buildForm(fresh);
      reloadPreview();
    });

    form.appendChild(el("div", { class: "row" }, save, reset));
  }

  void api.getOverlaySettings(overlay).then(({ settings }) => buildForm(settings));
}
