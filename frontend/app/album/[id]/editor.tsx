import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { BookPreview } from "@/src/components/book-preview";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

type Tool = "background" | "layout" | "pages" | "text";

export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pageIdx, setPageIdx] = useState(0);
  const [tool, setTool] = useState<Tool>("background");
  const [history, setHistory] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  const q = useQuery({ queryKey: ["album", id], queryFn: () => api.getAlbum(String(id)), enabled: !!id });
  const bgsQ = useQuery({ queryKey: ["backgrounds"], queryFn: () => api.listBackgrounds() });
  const layoutsQ = useQuery({ queryKey: ["layouts"], queryFn: () => api.listLayouts() });

  const album = q.data?.album;
  const pages: any[] = album?.pages || [];
  const backgrounds = bgsQ.data?.backgrounds || [];
  const layouts = layoutsQ.data?.layouts || [];

  const currentPage = pages[pageIdx];

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

  const setBg = (color: string) => {
    if (!currentPage) return;
    const next = pages.map((p, i) => (i === pageIdx ? { ...p, background: color } : p));
    commit(next);
  };
  const setLayout = (layout: any) => {
    if (!currentPage) return;
    let photoIds = currentPage.photo_ids.slice(0, layout.photo_count);
    // pad from available photos if needed
    const avail = (album?.photos || []).map((p: any) => p.id);
    while (photoIds.length < layout.photo_count && avail.length) {
      const unused = avail.find((pid: string) => !photoIds.includes(pid));
      if (!unused) break;
      photoIds.push(unused);
    }
    const next = pages.map((p, i) => (i === pageIdx ? { ...p, layout_id: layout.id, layout_photo_count: layout.photo_count, photo_ids: photoIds } : p));
    commit(next);
  };
  const movePage = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= pages.length) return;
    const next = [...pages];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setPageIdx(to);
    commit(next);
  };
  const deletePage = (idx: number) => {
    const next = pages.filter((_, i) => i !== idx);
    setPageIdx(Math.max(0, Math.min(idx, next.length - 1)));
    commit(next);
  };
  const setText = (t: string) => {
    if (!currentPage) return;
    const next = pages.map((p, i) => (i === pageIdx ? { ...p, text: t } : p));
    commit(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="editor-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Edit ClickBook</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Pressable onPress={undo} testID="editor-undo"><Feather name="corner-up-left" size={20} color={history.length ? colors.onSurface : colors.muted} /></Pressable>
          <Pressable onPress={redo} testID="editor-redo"><Feather name="corner-up-right" size={20} color={redoStack.length ? colors.onSurface : colors.muted} /></Pressable>
        </View>
      </View>

      <View style={styles.previewArea}>
        {album ? (
          <BookPreview
            cover={album.cover_snapshot}
            pages={pages}
            photos={album.photos || []}
            albumName={album.name}
            size={260}
          />
        ) : null}
        <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Editing page {pageIdx + 1} of {pages.length}</Text>
      </View>

      <View style={styles.toolTabs}>
        {(["background", "layout", "pages", "text"] as Tool[]).map((t) => (
          <Pressable key={t} testID={`editor-tool-${t}`} onPress={() => setTool(t)} style={[styles.toolTab, tool === t && styles.toolTabActive]}>
            <Feather name={t === "background" ? "droplet" : t === "layout" ? "grid" : t === "pages" ? "layers" : "type"} size={16} color={tool === t ? colors.onBrandPrimary : colors.onSurface} />
            <Text style={{ marginLeft: 6, color: tool === t ? colors.onBrandPrimary : colors.onSurface, fontFamily: fonts.text, fontSize: 12, textTransform: "capitalize" }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }}>
        {tool === "background" && (
          <>
            <Text style={s.label}>Choose background</Text>
            <View style={styles.bgGrid}>
              {backgrounds.map((b: any) => (
                <Pressable key={b.id} testID={`bg-${b.id}`} onPress={() => setBg(b.color)} style={[styles.bgSwatch, { backgroundColor: b.color, borderColor: currentPage?.background === b.color ? colors.brandPrimary : colors.border, borderWidth: currentPage?.background === b.color ? 3 : 1 }]}>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {tool === "layout" && (
          <>
            <Text style={s.label}>Choose layout</Text>
            <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              {layouts.map((l: any) => (
                <Pressable key={l.id} testID={`layout-${l.id}`} onPress={() => setLayout(l)} style={[styles.layoutRow, currentPage?.layout_id === l.id && { borderColor: colors.brandPrimary, borderWidth: 2 }]}>
                  <View style={styles.layoutIcon}>
                    {l.photo_count === 1 ? <View style={styles.layoutBox} /> : <><View style={[styles.layoutBox, { flex: 1, marginBottom: 3 }]} /><View style={[styles.layoutBox, { flex: 1 }]} /></>}
                  </View>
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text style={s.h2}>{l.name}</Text>
                    <Text style={s.bodyMuted}>{l.photo_count} photo{l.photo_count > 1 ? "s" : ""}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {tool === "pages" && (
          <>
            <Text style={s.label}>Page order</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {pages.map((p, i) => (
                <View key={p.id} style={[styles.pageRow, i === pageIdx && { borderColor: colors.brandPrimary, borderWidth: 2 }]}>
                  <Pressable onPress={() => setPageIdx(i)} testID={`page-${i}-select`} style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                    <View style={[styles.pageChip, { backgroundColor: p.background }]}>
                      <Text style={{ color: p.background === "#1C1917" ? "#FFF" : colors.onSurface, fontFamily: fonts.text, fontSize: 11 }}>{i + 1}</Text>
                    </View>
                    <Text style={[s.body, { marginLeft: spacing.md }]}>{p.layout_photo_count} photo layout</Text>
                  </Pressable>
                  <Pressable onPress={() => movePage(i, -1)} testID={`page-${i}-up`} style={styles.iconBtn}><Feather name="arrow-up" size={16} color={colors.onSurface} /></Pressable>
                  <Pressable onPress={() => movePage(i, 1)} testID={`page-${i}-down`} style={styles.iconBtn}><Feather name="arrow-down" size={16} color={colors.onSurface} /></Pressable>
                  <Pressable onPress={() => deletePage(i)} testID={`page-${i}-delete`} style={styles.iconBtn}><Feather name="trash-2" size={16} color={colors.error} /></Pressable>
                </View>
              ))}
            </View>
          </>
        )}
        {tool === "text" && (
          <>
            <Text style={s.label}>Add text to page {pageIdx + 1}</Text>
            <TextInput
              testID="editor-text-input"
              defaultValue={currentPage?.text || ""}
              onEndEditing={(e) => setText(e.nativeEvent.text)}
              placeholder="Caption or memory..."
              placeholderTextColor={colors.muted}
              multiline
              style={styles.textInput}
            />
            <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Tap outside to save.</Text>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="editor-review-button" label="Review & Order" onPress={() => router.push({ pathname: "/album/[id]/review", params: { id: String(id) } })} />
      </View>
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
  bgGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  bgSwatch: { width: 60, height: 60, borderRadius: radius.md },
  layoutRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  layoutIcon: { width: 48, height: 48, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, padding: 4, justifyContent: "center" },
  layoutBox: { flex: 1, backgroundColor: colors.borderStrong, borderRadius: 2 },
  pageRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, gap: spacing.sm },
  pageChip: { width: 36, height: 36, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  iconBtn: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  textInput: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 90, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, textAlignVertical: "top" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
