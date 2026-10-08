// Renders a page from the design model at any size. Used by the 3D preview, editor and page editor,
// so what the customer sees is exactly what the print PDF renders.
import { memo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import {
  Page, Photo, TextObject, slotRects, imageDrawRect, defaultTransform, fontFamilyFor, rotatedDims,
} from "@/src/design";
import { colors } from "@/src/theme";
import { fileUrl } from "@/src/api";

type Props = {
  page: Page;
  photosById: Record<string, Photo>;
  size: number;
  pageNumber?: number;
  numberSide?: "left" | "right";
  selectedSlot?: number | null;
  selectedText?: string | null;
  onSlotPress?: (slot: number) => void;
  onTextPress?: (id: string) => void;
  hideText?: string | null; // text id being edited inline elsewhere
  onImageDims?: (photoId: string, w: number, h: number) => void;
};

export const PageCanvas = memo(PageCanvasImpl);

function PageCanvasImpl({ page, photosById, size, pageNumber, numberSide = "right", selectedSlot, selectedText, onSlotPress, onTextPress, hideText, onImageDims }: Props) {
  const rects = slotRects(page);
  const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
  return (
    <View style={{ width: size, height: size, backgroundColor: page.background || "#FFFFFF", overflow: "hidden" }}>
      {page.photo_ids.slice(0, rects.length).map((pid, i) => {
        const photo = photosById[pid];
        const r = rects[i];
        const sw = r.w * size, sh = r.h * size;
        const tr = page.images?.[String(i)] || defaultTransform();
        const raw = dims[pid] || (photo?.width && photo?.height ? { w: photo.width, h: photo.height } : null);
        const d = raw ? rotatedDims(raw.w, raw.h, tr) : null;
        const draw = d ? imageDrawRect(sw, sh, d.w, d.h, tr) : { dx: 0, dy: 0, dw: sw, dh: sh };
        const rot = ((tr.rotate || 0) % 360 + 360) % 360;
        const swap = rot === 90 || rot === 270;
        // For 90°/270° the element box is the un-rotated image (dh×dw) centred in the rotated draw rect, then rotated.
        const box = swap
          ? { left: draw.dx + (draw.dw - draw.dh) / 2, top: draw.dy + (draw.dh - draw.dw) / 2, width: draw.dh, height: draw.dw }
          : { left: draw.dx, top: draw.dy, width: draw.dw, height: draw.dh };
        const selected = selectedSlot === i;
        // small renders (page-order rows, strips) use the 400px derivative; the book/editor use the 1200px preview.
        // Full-resolution originals are never loaded in the app — only the print pipeline reads them.
        const uri = Math.max(sw, sh) <= 130 ? (photo?.thumbnail_url || photo?.preview_url) : (photo?.preview_url || photo?.thumbnail_url);
        return (
          <Pressable key={pid + i} disabled={!onSlotPress} onPress={() => onSlotPress?.(i)}
            style={{ position: "absolute", left: r.x * size, top: r.y * size, width: sw, height: sh, overflow: "hidden", backgroundColor: colors.surfaceTertiary }}>
            {uri ? (
              <Image
                source={{ uri: fileUrl(uri) }}
                recyclingKey={pid}
                cachePolicy="memory-disk"
                allowDownscaling
                style={{ position: "absolute", ...box, transform: rot ? [{ rotate: `${rot}deg` }] : undefined }}
                contentFit={d ? "fill" : "cover"}
                transition={120}
                onLoad={(e) => {
                  const s = e.source; if (s?.width && s?.height && !dims[pid]) { setDims((m) => ({ ...m, [pid]: { w: s.width, h: s.height } })); onImageDims?.(pid, s.width, s.height); }
                }}
              />
            ) : null}
            {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.selected]} /> : null}
          </Pressable>
        );
      })}
      {(page.texts || []).filter((t) => t.id !== hideText).sort((a, b) => (a.z || 0) - (b.z || 0)).map((t) => (
        <TextBox key={t.id} t={t} size={size} selected={selectedText === t.id} onPress={onTextPress ? () => onTextPress(t.id) : undefined} />
      ))}
      {page.text && !(page.texts || []).length ? (
        <Text style={{ position: "absolute", bottom: size * 0.04, left: size * 0.06, right: size * 0.06, color: colors.onSurface, fontFamily: "PlayfairDisplay-Regular", fontSize: size * 0.035 }} numberOfLines={2}>{page.text}</Text>
      ) : null}
      {pageNumber ? <Text style={[styles.pageNum, { fontSize: Math.max(7, size * 0.025), bottom: size * 0.012 }, numberSide === "left" ? { left: size * 0.03 } : { right: size * 0.03 }]}>{pageNumber}</Text> : null}
    </View>
  );
}

export function TextBox({ t, size, selected, onPress }: { t: TextObject; size: number; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress}
      style={{ position: "absolute", left: t.x * size, top: t.y * size, width: t.w * size, height: t.h * size, zIndex: 5 + (t.z || 0), overflow: "hidden" }}>
      <Text style={{
        fontFamily: fontFamilyFor(t.font, t.weight), fontSize: t.size * size, lineHeight: t.size * size * 1.25,
        color: t.color, textAlign: t.align, fontStyle: t.italic ? "italic" : "normal",
      }}>{t.text}</Text>
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.selectedText]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageNum: { position: "absolute", color: colors.muted, fontFamily: "Inter-Regular" },
  selected: { borderWidth: 2, borderColor: colors.brandPrimary },
  selectedText: { borderWidth: 1, borderColor: colors.brandPrimary, borderStyle: "dashed" },
});
