// Shared design model (mirrors backend/design.py). Fractions are relative to the page.
export type Rect = { x: number; y: number; w: number; h: number };
export type ImageTransform = { photo_id?: string; scale: number; ox: number; oy: number; fit?: "fill" | "fit" };
export type TextObject = {
  id: string; text: string; x: number; y: number; w: number; h: number;
  font: FontKey; size: number; weight: "regular" | "bold"; italic?: boolean;
  color: string; align: "left" | "center" | "right"; z?: number;
};
export type Page = {
  id: string; layout_id: string; layout_photo_count: number; photo_ids: string[];
  images?: Record<string, ImageTransform>; texts?: TextObject[];
  background: string; text?: string; order?: number;
  slots?: Rect[]; // explicit slot rects (used for covers)
};
export type CoverDesign = {
  style: CoverStyleKey; photo_id: string; image: ImageTransform; frame: Rect; background: string; texts: TextObject[];
};
export type CoverStyleKey = "signature" | "classic" | "editorial";
export const COVER_STYLES: { key: CoverStyleKey; name: string; frame: Rect; background: string }[] = [
  { key: "signature", name: "Signature Full Bleed", frame: { x: 0, y: 0, w: 1, h: 1 }, background: "#1C1917" },
  { key: "classic", name: "Classic Portrait", frame: { x: 0.14, y: 0.1, w: 0.72, h: 0.6 }, background: "#FAFAF8" },
  { key: "editorial", name: "Editorial Frame", frame: { x: 0.08, y: 0.08, w: 0.84, h: 0.6 }, background: "#F0EFEA" },
];

/** A cover is edited/rendered as a one-slot page whose slot is the cover frame. */
export function coverToPage(cd: CoverDesign): Page {
  return { id: "cover", layout_id: "cover", layout_photo_count: 1, photo_ids: [cd.photo_id], images: { "0": { ...cd.image, photo_id: cd.photo_id } }, texts: cd.texts || [], background: cd.background, slots: [cd.frame] };
}
export function pageToCover(p: Page, prev: CoverDesign): CoverDesign {
  return { ...prev, photo_id: p.photo_ids[0], image: p.images?.["0"] || defaultTransform(), texts: p.texts || [], background: p.background, frame: p.slots?.[0] || prev.frame };
}
export type Photo = { id: string; preview_url?: string; thumbnail_url?: string; original_url?: string; width?: number; height?: number };

export const DEFAULT_POSITIONS: Record<number, Rect[]> = {
  1: [{ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }],
  2: [{ x: 0.05, y: 0.05, w: 0.9, h: 0.44 }, { x: 0.05, y: 0.51, w: 0.9, h: 0.44 }],
  3: [{ x: 0.05, y: 0.05, w: 0.9, h: 0.55 }, { x: 0.05, y: 0.63, w: 0.44, h: 0.32 }, { x: 0.51, y: 0.63, w: 0.44, h: 0.32 }],
  4: [{ x: 0.05, y: 0.05, w: 0.44, h: 0.44 }, { x: 0.51, y: 0.05, w: 0.44, h: 0.44 }, { x: 0.05, y: 0.51, w: 0.44, h: 0.44 }, { x: 0.51, y: 0.51, w: 0.44, h: 0.44 }],
};

export const LAYOUT_NAMES: Record<number, string> = { 1: "Single", 2: "Duo", 3: "Trio", 4: "Quad" };

export const ALBUM_STYLES = [
  { key: "elegant", name: "Elegant", desc: "Minimal, refined and spacious. Usually one main photograph per page with generous negative space.", rhythm: [1, 1, 1, 2] },
  { key: "balanced", name: "Balanced", desc: "A beautiful mix of single-photo and multi-photo pages for a natural storytelling flow.", rhythm: [1, 2, 1, 2] },
  { key: "gallery", name: "Gallery", desc: "Rich and expressive. More photographs per page for a fuller visual story.", rhythm: [2, 3, 2, 4] },
] as const;
export type StyleKey = (typeof ALBUM_STYLES)[number]["key"];

export type FontKey = "playfair" | "cormorant" | "lora" | "inter" | "montserrat" | "dancing";
export const FONTS: { key: FontKey; label: string; family: string }[] = [
  { key: "playfair", label: "Playfair", family: "PlayfairDisplay" },
  { key: "cormorant", label: "Cormorant", family: "CormorantGaramond" },
  { key: "lora", label: "Lora", family: "Lora" },
  { key: "inter", label: "Inter", family: "Inter" },
  { key: "montserrat", label: "Montserrat", family: "Montserrat" },
  { key: "dancing", label: "Script", family: "DancingScript" },
];
export const FONT_ASSETS: Record<string, any> = {
  "PlayfairDisplay-Regular": require("../assets/fonts/PlayfairDisplay-Regular.ttf"),
  "PlayfairDisplay-Bold": require("../assets/fonts/PlayfairDisplay-Bold.ttf"),
  "CormorantGaramond-Regular": require("../assets/fonts/CormorantGaramond-Regular.ttf"),
  "CormorantGaramond-Bold": require("../assets/fonts/CormorantGaramond-Bold.ttf"),
  "Lora-Regular": require("../assets/fonts/Lora-Regular.ttf"),
  "Lora-Bold": require("../assets/fonts/Lora-Bold.ttf"),
  "Inter-Regular": require("../assets/fonts/Inter-Regular.ttf"),
  "Inter-Bold": require("../assets/fonts/Inter-Bold.ttf"),
  "Montserrat-Regular": require("../assets/fonts/Montserrat-Regular.ttf"),
  "Montserrat-Bold": require("../assets/fonts/Montserrat-Bold.ttf"),
  "DancingScript-Regular": require("../assets/fonts/DancingScript-Regular.ttf"),
  "DancingScript-Bold": require("../assets/fonts/DancingScript-Bold.ttf"),
};
export const TEXT_COLORS = ["#1C1917", "#FFFFFF", "#C56A47", "#78716C", "#7A3E27", "#4A7C59", "#4A6C7C", "#D99A29"];

export function fontFamilyFor(font: FontKey, weight: "regular" | "bold") {
  const f = FONTS.find((x) => x.key === font) || FONTS[2];
  return `${f.family}-${weight === "bold" ? "Bold" : "Regular"}`;
}

export const defaultTransform = (): ImageTransform => ({ scale: 1, ox: 0, oy: 0, fit: "fill" });

export function slotRects(page: Page): Rect[] {
  if (page.slots?.length) return page.slots;
  return DEFAULT_POSITIONS[page.photo_ids.length] || DEFAULT_POSITIONS[page.layout_photo_count] || DEFAULT_POSITIONS[1];
}

/** Same math as backend design.image_draw_rect: where to draw an image inside a slot (px). */
export function imageDrawRect(slotW: number, slotH: number, imgW: number, imgH: number, tr: ImageTransform) {
  const r = imgW / Math.max(1, imgH);
  const fit = tr.fit === "fit";
  let dw: number, dh: number;
  if ((r > slotW / slotH) !== fit) { dh = slotH; dw = slotH * r; } else { dw = slotW; dh = slotW / r; }
  const s = Math.max(0.2, tr.scale || 1);
  dw *= s; dh *= s;
  const oxMax = Math.max(0, (dw - slotW) / 2);
  const oyMax = Math.max(0, (dh - slotH) / 2);
  const ox = Math.max(-1, Math.min(1, tr.ox || 0)) * oxMax;
  const oy = Math.max(-1, Math.min(1, tr.oy || 0)) * oyMax;
  return { dx: (slotW - dw) / 2 + ox, dy: (slotH - dh) / 2 + oy, dw, dh, oxMax, oyMax };
}

export function newTextObject(partial?: Partial<TextObject>): TextObject {
  return {
    id: Math.random().toString(36).slice(2, 10), text: "Your text", x: 0.15, y: 0.42, w: 0.7, h: 0.16,
    font: "playfair", size: 0.06, weight: "regular", italic: false, color: "#1C1917", align: "center", z: 1, ...partial,
  };
}
