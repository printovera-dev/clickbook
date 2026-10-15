import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { BookPreview } from "@/src/components/book-preview";
import { PageOrderList } from "@/src/components/page-order-list";
import { Thumb } from "@/src/components/thumb";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

type Tool = "pages" | "photos";

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pageIdx, setPageIdx] = useState(0);
  const [tool, setTool] = useState<Tool>("pages");
  const [history, setHistory] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);
  const [sel, setSel] = useState<{ pi: number; slot: number } | null>(null);

  const q = useQuery({ queryKey: ["album", id], queryFn: () => api.getAlbum(String(id)), enabled: !!id });
  // Live preview follows the selected row; the book is never reset to the cover while editing.
  const album = q.data?.album;
  const pages: any[] = useMemo(() => album?.pages || [], [album?.pages]);
  // Paid albums are view-only: the server rejects edits (409), so never show the editor for them.
  useEffect(() => { if (album?.locked) router.replace({ pathname: "/album/[id]/preview", params: { id: String(id) } }); }, [album?.locked, id, router]);
  const photosById: Record<string, any> = useMemo(() => Object.fromEntries((album?.photos || []).map((p: any) => [p.id, p])), [album?.photos]);

  const commit = async (nextPages: any[]) => {
    setHistory((h) => [...h, pages]);
    setRedoStack([]);
    await api.updatePages(String(id), nextPages);
    q.refetch();
  };

  const undo = async () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRedoStack((r) => [...r, pages]);
    await api.updatePages(String(id), prev);
    q.refetch();
  };
  const redo = async () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setHistory((h) => [...h, pages]);
    await api.updatePages(String(id), next);
    q.refetch();
  };

  const deletePage = (idx: number) => {
    const next = pages.filter((_, i) => i !== idx);
    setPageIdx(Math.max(0, Math.min(idx, next.length - 1)));
    commit(next);
  };
  // Photo rearrangement: tap a photo slot to select, tap another slot (any page) to swap.
  const onSlotPress = (pi: number, slot: number) => {
    if (!sel) {
      setSel({ pi, slot });
      setPageIdx(pi);
      return;
    }
    if (sel.pi === pi && sel.slot === slot) {
      setSel(null);
      return;
    }
    const next = pages.map((p, i) => ({ ...p, photo_ids: [...p.photo_ids] }));
    const a = next[sel.pi].photo_ids[sel.slot];
    next[sel.pi].photo_ids[sel.slot] = next[pi].photo_ids[slot];
    next[pi].photo_ids[slot] = a;
    setSel(null);
    setPageIdx(pi);
    commit(next);
  };

  const header = (
    <View style={styles.topbar}>
      <Pressable onPress={() => router.back()} testID="editor-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
      <Text style={s.label}>Edit ClickBook</Text>
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Pressable onPress={() => router.push({ pathname: "/album/[id]/preview", params: { id: String(id) } })} testID="editor-3d-preview"><Feather name="book-open" size={20} color={colors.brandPrimary} /></Pressable>
        <Pressable onPress={undo} testID="editor-undo"><Feather name="corner-up-left" size={20} color={history.length ? colors.onSurface : colors.muted} /></Pressable>
        <Pressable onPress={redo} testID="editor-redo"><Feather name="corner-up-right" size={20} color={redoStack.length ? colors.onSurface : colors.muted} /></Pressable>
      </View>
    </View>
  );

  const previewArea = (
    <View style={styles.previewArea}>
      {album ? (
        <BookPreview
          cover={album.cover_snapshot} coverDesign={album.cover_design}
          pages={pages}
          photos={album.photos || []}
          albumName={album.name}
          size={300}
          focusPage={pageIdx}
          selectedPage={pageIdx}
          onSelectPage={(sel) => { if (sel !== "cover") setPageIdx(sel); }}
          onEditPage={(i) => router.push({ pathname: "/album/[id]/page", params: { id: String(id), index: String(i) } })} onEditCover={() => router.push({ pathname: "/album/[id]/page", params: { id: String(id), index: "cover" } })}
        />
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
        <Text style={s.bodyMuted}>Page {pageIdx + 1} of {pages.length}</Text>
        <Pressable testID="editor-edit-page" onPress={() => router.push({ pathname: "/album/[id]/page", params: { id: String(id), index: String(pageIdx) } })} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}>
          <Feather name="edit-3" size={14} color={colors.brandPrimary} /><Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 13 }}>Edit Page</Text>
        </Pressable>
      </View>
    </View>
  );

  const toolTabs = (
    <View style={styles.toolTabs}>
      {(["pages", "photos"] as Tool[]).map((t) => (
        <Pressable key={t} testID={`editor-tool-${t}`} accessibilityRole="button"
          onPress={() => setTool(t)} style={[styles.toolTab, tool === t && styles.toolTabActive]}>
          <Feather name={t === "pages" ? "layers" : "image"} size={16}
            color={tool === t ? colors.onBrandPrimary : colors.onSurface} />
          <Text style={{ marginLeft: 6, color: tool === t ? colors.onBrandPrimary : colors.onSurface,
            fontFamily: fonts.text, fontSize: 12 }}>
            {t === "pages" ? "Page Sequence" : "Swap Images"}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const footer = (
    <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
      <Button testID="editor-review-button" label="Review & Order" onPress={() => router.push({ pathname: "/album/[id]/review", params: { id: String(id) } })} />
    </View>
  );

  const renderPhotoRow = useCallback(({ item: p, index: pi }: { item: any; index: number }) => (
    <View style={[styles.pageRow, pi === pageIdx && { borderColor: colors.brandPrimary, borderWidth: 2 }]} testID={`photos-page-${pi}`}>
      <View style={[styles.pageChip, { backgroundColor: p.background }]}>
        <Text style={{ color: p.background === "#1C1917" ? "#FFF" : colors.onSurface, fontFamily: fonts.text, fontSize: 11 }}>{pi + 1}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: spacing.sm, marginLeft: spacing.md }}>
        {p.photo_ids.map((pid: string, slot: number) => {
          const photo = photosById[pid];
          const isSel = sel?.pi === pi && sel?.slot === slot;
          return (
            <Pressable key={`${pi}-${slot}`} testID={`photos-slot-${pi}-${slot}`} onPress={() => onSlotPress(pi, slot)} style={[styles.slotThumb, isSel && styles.slotThumbSelected]}>
              <Thumb uri={photo?.thumbnail_url} recyclingKey={pid} style={{ flex: 1 }} />
              {isSel ? <View style={styles.slotSelBadge}><Feather name="check" size={12} color="#FFF" /></View> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  ), [pageIdx, photosById, sel, onSlotPress]);

  if (tool === "photos") {
    // Virtualized: a 75-sheet album has 150 rows × up to 4 thumbnails — only the visible window is mounted.
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        {header}
        {previewArea}
        {toolTabs}
        <FlatList
          testID="editor-photos-list"
          data={pages}
          keyExtractor={(p) => p.id}
          renderItem={renderPhotoRow}
          extraData={`${pageIdx}-${sel?.pi}-${sel?.slot}`}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          style={styles.sheet}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120, gap: spacing.md }}
          ListHeaderComponent={
            <View>
              <Text style={s.label}>Swap Images</Text>
              <Text style={[s.bodyMuted, { marginTop: 4 }]}>Tap a photo to select it, then tap any other photo slot (same or another page) to swap.</Text>
            </View>
          }
        />
        {footer}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      {header}
      {previewArea}
      {toolTabs}

      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}>
        <Text style={s.label}>Page Sequence</Text>
        <Text style={[s.bodyMuted, { marginTop: 4, marginBottom: spacing.md }]} >
          Drag pages to change their order, or select a page to edit it.
        </Text>
        <PageOrderList
          pages={pages} photosById={photosById} selected={pageIdx}
          onSelect={setPageIdx}
          onReorder={(from, to) => {
            const next = [...pages];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            setPageIdx(to);
            commit(next);
          }}
          onDelete={deletePage}
        />
      </ScrollView>

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg },
  previewArea: { alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  toolTabs: { flexDirection: "row", gap: 8, padding: spacing.md, paddingBottom: 0 },
  toolTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  toolTabActive: { backgroundColor: colors.brandPrimary },
  sheet: { flex: 1, backgroundColor: colors.surface },
  pageRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, gap: spacing.sm },
  pageChip: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  slotThumb: { width: 64, height: 64, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  slotThumbSelected: { borderColor: colors.brandPrimary, borderWidth: 3 },
  slotSelBadge: { position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  iconBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
