// Drag-to-reorder list of page rows (long-press free: drag the handle). Commits once on release.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Feather from "@react-native-vector-icons/feather";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { s } from "@/src/ui";
import { PageCanvas } from "@/src/components/page-canvas";
import type { Page, Photo } from "@/src/design";

const ROW_H = 64;
const GAP = 8;
const STEP = ROW_H + GAP;

export function PageOrderList({ pages, photosById, selected, onSelect, onReorder, onDelete }: {
  pages: Page[]; photosById: Record<string, Photo>; selected: number;
  onSelect: (i: number) => void; onReorder: (from: number, to: number) => void; onDelete: (i: number) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const target = drag ? Math.max(0, Math.min(pages.length - 1, Math.round(drag.from + drag.dy / STEP))) : -1;

  const update = (from: number, dy: number) => setDrag({ from, dy });
  const finish = (from: number, dy: number) => {
    const to = Math.max(0, Math.min(pages.length - 1, Math.round(from + dy / STEP)));
    setDrag(null);
    if (to !== from) onReorder(from, to);
  };

  return (
    <View style={{ gap: GAP, marginTop: spacing.md }}>
      {pages.map((p, i) => {
        const isDragging = drag?.from === i;
        let shift = 0;
        if (drag && !isDragging) {
          if (drag.from < i && i <= target) shift = -STEP;
          else if (target <= i && i < drag.from) shift = STEP;
        }
        const pan = Gesture.Pan().activateAfterLongPress(120)
          .onUpdate((e) => { "worklet"; runOnJS(update)(i, e.translationY); })
          .onEnd((e) => { "worklet"; runOnJS(finish)(i, e.translationY); });
        return (
          <View key={p.id} testID={`page-row-${i}`}
            style={[styles.row, i === selected && { borderColor: colors.brandPrimary, borderWidth: 2 },
              isDragging && styles.rowDragging,
              { transform: [{ translateY: isDragging ? drag!.dy : shift }] }]}>
            <GestureDetector gesture={pan}>
              <View testID={`page-${i}-drag`} style={styles.handle}><Feather name="menu" size={18} color={colors.muted} /></View>
            </GestureDetector>
            <Pressable onPress={() => onSelect(i)} testID={`page-${i}-select`} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <View style={{ borderRadius: 3, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
                <PageCanvas page={p} photosById={photosById} size={48} />
              </View>
              <View>
                <Text style={s.body}>Page {isDragging ? target + 1 : i + 1}</Text>
                <Text style={[s.bodyMuted, { fontSize: 12 }]}>{p.photo_ids.length} photo{p.photo_ids.length > 1 ? "s" : ""}{p.texts?.length ? ` · ${p.texts.length} text` : ""}</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => onDelete(i)} testID={`page-${i}-delete`} style={styles.iconBtn}><Feather name="trash-2" size={16} color={colors.error} /></Pressable>
          </View>
        );
      })}
      <Text style={[s.bodyMuted, { fontFamily: fonts.text, fontSize: 12 }]}>Hold the ≡ handle and drag to reorder pages.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: ROW_H, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  rowDragging: { zIndex: 10, elevation: 6, borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  handle: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
