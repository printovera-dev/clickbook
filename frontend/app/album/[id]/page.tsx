// Focused full-screen page editor (opened by double-tapping a page in the 3D preview).
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, Dimensions, Platform, KeyboardAvoidingView } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { PageCanvas } from "@/src/components/page-canvas";
import {
  Page, Photo, TextObject, CoverDesign, FONTS, TEXT_COLORS, LAYOUT_NAMES, DEFAULT_POSITIONS, COVER_STYLES,
  slotRects, imageDrawRect, defaultTransform, newTextObject, fontFamilyFor, coverToPage, pageToCover,
} from "@/src/design";

type Tool = "image" | "replace" | "text" | "layout" | "background" | "coverstyle";
const { width: SCREEN_W } = Dimensions.get("window");

export default function PageEditor() {
  const { id, index, tool: initialTool } = useLocalSearchParams<{ id: string; index: string; tool?: string }>();
  const isCover = index === "cover";
  const pageIndex = isCover ? -1 : Number(index || 0);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const albumQ = useQuery({ queryKey: ["album", id], queryFn: () => api.getAlbum(String(id)), enabled: !!id });
  const bgQ = useQuery({ queryKey: ["backgrounds"], queryFn: api.listBackgrounds });
  const album = albumQ.data?.album;
  const photos: Photo[] = album?.photos || [];
  const photosById = useMemo(() => Object.fromEntries(photos.map((p) => [p.id, p])), [photos]);

  const [page, setPage] = useState<Page | null>(null);
  const [history, setHistory] = useState<Page[]>([]);
  const [redo, setRedo] = useState<Page[]>([]);
  const [tool, setTool] = useState<Tool>("image");
  const [selSlot, setSelSlot] = useState<number | null>(0);
  const [selText, setSelText] = useState<string | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverKey, setCoverKey] = useState<string>("signature");
  const dims = useRef<Record<string, { w: number; h: number }>>({});
  const gestureStart = useRef<any>(null);

  useEffect(() => {
    if (album && !page) {
      if (isCover) {
        const cd: CoverDesign | null = album.cover_design;
        if (cd) { setPage(coverToPage(cd)); setCoverKey(cd.style || "signature"); }
        return;
      }
      const p = album.pages?.[pageIndex];
      if (p) {
        const base = { ...p, images: p.images || {}, texts: p.texts || [] };
        if (initialTool === "text") {
          const t = newTextObject({ z: base.texts.length + 1 });
          setPage({ ...base, texts: [...base.texts, t] }); setHistory([base]); setSelText(t.id); setSelSlot(null); setTool("text"); setEditingText(true);
        } else setPage(base);
      }
    }
  }, [album, page, pageIndex, isCover, initialTool]);

  const size = Math.min(SCREEN_W - 32, 460);
  const dirty = history.length > 0;

  // ---- history ----
  const commit = (next: Page) => {
    setPage((prev) => { if (prev) setHistory((h) => [...h.slice(-40), prev]); return next; });
    setRedo([]);
  };
  const snapshot = () => { if (page) { setHistory((h) => [...h.slice(-40), page]); setRedo([]); } };
  const undo = () => { if (!history.length || !page) return; const prev = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); setRedo((r) => [...r, page]); setPage(prev); };
  const redoFn = () => { if (!redo.length || !page) return; const nx = redo[redo.length - 1]; setRedo((r) => r.slice(0, -1)); setHistory((h) => [...h, page]); setPage(nx); };

  const selectedTextObj = page?.texts?.find((t) => t.id === selText) || null;
  const updateText = (patch: Partial<TextObject>, live = false) => {
    if (!page || !selText) return;
    const next = { ...page, texts: page.texts!.map((t) => (t.id === selText ? { ...t, ...patch } : t)) };
    live ? setPage(next) : commit(next);
  };
  const updateImage = (slot: number, patch: any, live = false) => {
    if (!page) return;
    const cur = page.images?.[String(slot)] || defaultTransform();
    const next = { ...page, images: { ...(page.images || {}), [String(slot)]: { ...cur, photo_id: page.photo_ids[slot], ...patch } } };
    live ? setPage(next) : commit(next);
  };

  // ---- image gestures (pan + pinch on the selected slot) ----
  const rects = page ? slotRects(page) : [];
  const slotRect = selSlot != null && rects[selSlot] ? rects[selSlot] : null;
  const slotTr = page && selSlot != null ? (page.images?.[String(selSlot)] || defaultTransform()) : null;
  const slotPhotoId = page && selSlot != null ? page.photo_ids[selSlot] : undefined;
  const slotDims = slotPhotoId ? dims.current[slotPhotoId] || (photosById[slotPhotoId]?.width ? { w: photosById[slotPhotoId].width!, h: photosById[slotPhotoId].height! } : null) : null;

  const onImgStart = () => { gestureStart.current = { tr: slotTr, page }; snapshot(); };
  const onImgUpdate = (tx: number, ty: number, sc: number) => {
    if (!slotRect || !gestureStart.current?.tr || selSlot == null) return;
    const st = gestureStart.current.tr;
    const scale = Math.min(4, Math.max(1, st.scale * sc));
    const d = slotDims || { w: 1, h: 1 };
    const { oxMax, oyMax } = imageDrawRect(slotRect.w * size, slotRect.h * size, d.w, d.h, { ...st, scale });
    const ox = oxMax > 0 ? Math.max(-1, Math.min(1, st.ox + tx / oxMax)) : 0;
    const oy = oyMax > 0 ? Math.max(-1, Math.min(1, st.oy + ty / oyMax)) : 0;
    updateImage(selSlot, { scale, ox, oy }, true);
  };
  const imgPan = Gesture.Pan().onStart(() => { "worklet"; runOnJS(onImgStart)(); })
    .onUpdate((e) => { "worklet"; runOnJS(onImgUpdate)(e.translationX, e.translationY, 1); });
  const imgPinch = Gesture.Pinch().onUpdate((e) => { "worklet"; runOnJS(onImgUpdate)(0, 0, e.scale); });
  const imgGesture = Gesture.Simultaneous(imgPan, imgPinch);

  // ---- text gestures (drag box, resize handle) ----
  const onTextStart = () => { gestureStart.current = { t: selectedTextObj }; snapshot(); };
  const onTextMove = (tx: number, ty: number) => {
    const st = gestureStart.current?.t as TextObject | undefined; if (!st) return;
    updateText({ x: Math.max(0, Math.min(1 - st.w, st.x + tx / size)), y: Math.max(0, Math.min(1 - st.h, st.y + ty / size)) }, true);
  };
  const onTextResize = (tx: number, ty: number) => {
    const st = gestureStart.current?.t as TextObject | undefined; if (!st) return;
    updateText({ w: Math.max(0.15, Math.min(1 - st.x, st.w + tx / size)), h: Math.max(0.06, Math.min(1 - st.y, st.h + ty / size)) }, true);
  };
  const textPan = Gesture.Pan().onStart(() => { "worklet"; runOnJS(onTextStart)(); }).onUpdate((e) => { "worklet"; runOnJS(onTextMove)(e.translationX, e.translationY); });
  const resizePan = Gesture.Pan().onStart(() => { "worklet"; runOnJS(onTextStart)(); }).onUpdate((e) => { "worklet"; runOnJS(onTextResize)(e.translationX, e.translationY); });

  // ---- actions ----
  const addText = () => {
    if (!page) return;
    const t = newTextObject({ z: (page.texts?.length || 0) + 1 });
    commit({ ...page, texts: [...(page.texts || []), t] });
    setSelText(t.id); setSelSlot(null); setTool("text"); setEditingText(true);
  };
  const duplicateText = () => {
    if (!page || !selectedTextObj) return;
    const t = { ...selectedTextObj, id: Math.random().toString(36).slice(2, 10), x: Math.min(0.9 - selectedTextObj.w, selectedTextObj.x + 0.04), y: Math.min(0.9 - selectedTextObj.h, selectedTextObj.y + 0.04), z: (page.texts?.length || 0) + 1 };
    commit({ ...page, texts: [...(page.texts || []), t] }); setSelText(t.id);
  };
  const deleteText = () => { if (!page || !selText) return; commit({ ...page, texts: page.texts!.filter((t) => t.id !== selText) }); setSelText(null); };
  const changeLayout = (count: number) => {
    if (!page) return;
    const unused = photos.map((p) => p.id).filter((pid) => !page.photo_ids.includes(pid));
    const ids = page.photo_ids.slice(0, count);
    while (ids.length < count && unused.length) ids.push(unused.shift()!);
    while (ids.length < count && photos.length) ids.push(photos[ids.length % photos.length].id);
    const images: Record<string, any> = {};
    ids.forEach((pid, i) => { const prev = page.images?.[String(i)]; images[String(i)] = prev && prev.photo_id === pid ? prev : { ...defaultTransform(), photo_id: pid }; });
    commit({ ...page, photo_ids: ids, layout_photo_count: count, images });
    setSelSlot(0);
  };
  const replaceImage = (pid: string) => {
    if (!page || selSlot == null) return;
    const ids = [...page.photo_ids]; ids[selSlot] = pid;
    commit({ ...page, photo_ids: ids, images: { ...(page.images || {}), [String(selSlot)]: { ...(page.images?.[String(selSlot)] || defaultTransform()), photo_id: pid } } });
    setTool("image");
  };
  const setCoverStyle = (key: string) => {
    if (!page) return;
    const st = COVER_STYLES.find((c) => c.key === key); if (!st) return;
    commit({ ...page, slots: [st.frame], background: st.background, images: { "0": { ...defaultTransform(), photo_id: page.photo_ids[0] } } });
    setCoverKey(key as any);
  };
  const save = async () => {
    if (!album || !page) return;
    setSaving(true);
    try {
      const r = isCover
        ? await api.updateAlbum(String(id), { cover_design: { ...pageToCover(page, album.cover_design), style: coverKey } })
        : await api.updatePages(String(id), album.pages.map((p: Page, i: number) => (i === pageIndex ? page : p)));
      qc.setQueryData(["album", id], r);
      qc.invalidateQueries({ queryKey: ["albums"] });
      router.back();
    } catch (e: any) {
      Alert.alert("Could not save", e?.message || "Please try again");
    } finally { setSaving(false); }
  };
  const cancel = () => {
    if (!dirty) return router.back();
    if (Platform.OS === "web") { if (window.confirm("Discard your changes to this page?")) router.back(); return; }
    Alert.alert("Discard changes?", "Your edits to this page will be lost.", [{ text: "Keep editing", style: "cancel" }, { text: "Discard", style: "destructive", onPress: () => router.back() }]);
  };

  if (!page) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top, alignItems: "center", justifyContent: "center", padding: spacing.xl }]}>
        <Text style={s.bodyMuted}>{isCover && album && !album.cover_design ? "Design your album first to edit the cover." : "Loading…"}</Text>
        {album ? <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg, minHeight: 44 }}><Text style={{ color: colors.brandPrimary, fontFamily: fonts.text }}>← Back</Text></Pressable> : null}
      </View>
    );
  }

  const tools: { key: Tool; icon: any; label: string }[] = [
    { key: "image", icon: "move", label: "Adjust Image" },
    { key: "replace", icon: "image", label: "Change Image" },
    { key: "text", icon: "type", label: "Add Text" },
    isCover ? { key: "coverstyle", icon: "book", label: "Cover Style" } : { key: "layout", icon: "grid", label: "Change Layout" },
    { key: "background", icon: "droplet", label: "Background" },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.topbar}>
        <Pressable onPress={cancel} testID="page-editor-cancel" style={styles.topBtn}><Text style={styles.topBtnText}>Cancel</Text></Pressable>
        <Text style={s.label}>{isCover ? "Edit Cover" : `Edit Page ${pageIndex + 1}`}</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Pressable onPress={undo} disabled={!history.length} testID="page-editor-undo" style={styles.iconBtn}><Feather name="corner-up-left" size={20} color={history.length ? colors.onSurface : colors.muted} /></Pressable>
          <Pressable onPress={redoFn} disabled={!redo.length} testID="page-editor-redo" style={styles.iconBtn}><Feather name="corner-up-right" size={20} color={redo.length ? colors.onSurface : colors.muted} /></Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingVertical: spacing.md }} keyboardShouldPersistTaps="handled">
        <View style={[styles.canvasWrap, { width: size, height: size }]} testID="page-editor-canvas">
          <PageCanvas
            page={page} photosById={photosById} size={size}
            selectedSlot={tool === "image" || tool === "replace" ? selSlot : null}
            selectedText={selText}
            onSlotPress={(i) => { setSelSlot(i); setSelText(null); if (tool === "text") setTool("image"); }}
            onTextPress={(tid) => { setSelText(tid); setSelSlot(null); setTool("text"); }}
            onImageDims={(pid, w, h) => { dims.current[pid] = { w, h }; }}
          />
          {/* Image gesture surface */}
          {tool === "image" && slotRect ? (
            <GestureDetector gesture={imgGesture}>
              <View testID="page-editor-image-gesture" style={{ position: "absolute", left: slotRect.x * size, top: slotRect.y * size, width: slotRect.w * size, height: slotRect.h * size }} />
            </GestureDetector>
          ) : null}
          {/* Text drag + resize surfaces */}
          {selectedTextObj && tool === "text" ? (
            <>
              <GestureDetector gesture={textPan}>
                <Pressable testID="page-editor-text-drag" onPress={() => setEditingText(true)} style={{ position: "absolute", left: selectedTextObj.x * size, top: selectedTextObj.y * size, width: selectedTextObj.w * size, height: selectedTextObj.h * size }} />
              </GestureDetector>
              <GestureDetector gesture={resizePan}>
                <View testID="page-editor-text-resize" style={[styles.handle, { left: (selectedTextObj.x + selectedTextObj.w) * size - 16, top: (selectedTextObj.y + selectedTextObj.h) * size - 16 }]}>
                  <Feather name="maximize-2" size={12} color={colors.onBrandPrimary} />
                </View>
              </GestureDetector>
            </>
          ) : null}
        </View>
        <Text style={[s.bodyMuted, { marginTop: spacing.sm, textAlign: "center", paddingHorizontal: spacing.xl }]}>
          {tool === "image" ? "Drag to move the photo · pinch to zoom" : tool === "text" ? (selectedTextObj ? "Drag the text to move · use the corner handle to resize · tap to edit" : "Tap a text on the page or add a new one") : ""}
        </Text>
      </ScrollView>

      {/* Bottom toolbar */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md }}>
          {tools.map((t) => (
            <Pressable key={t.key} testID={`page-tool-${t.key}`} onPress={() => { if (t.key === "text" && !selectedTextObj) addText(); else setTool(t.key); if (t.key !== "text") setSelText(null); if ((t.key === "image" || t.key === "replace") && selSlot == null) setSelSlot(0); }}
              style={[styles.toolTab, tool === t.key && styles.toolTabActive]}>
              <Feather name={t.icon} size={16} color={tool === t.key ? colors.onBrandPrimary : colors.onSurface} />
              <Text style={[styles.toolText, tool === t.key && { color: colors.onBrandPrimary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.panel}>
          {tool === "image" && slotTr && selSlot != null ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              <Chip icon="zoom-in" label="Zoom in" onPress={() => updateImage(selSlot, { scale: Math.min(4, slotTr.scale + 0.2) })} testID="img-zoom-in" />
              <Chip icon="zoom-out" label="Zoom out" onPress={() => updateImage(selSlot, { scale: Math.max(1, slotTr.scale - 0.2), ox: slotTr.scale - 0.2 <= 1 ? 0 : slotTr.ox, oy: slotTr.scale - 0.2 <= 1 ? 0 : slotTr.oy })} testID="img-zoom-out" />
              <Chip icon="maximize" label="Fill" active={slotTr.fit !== "fit"} onPress={() => updateImage(selSlot, { fit: "fill" })} testID="img-fill" />
              <Chip icon="minimize" label="Fit" active={slotTr.fit === "fit"} onPress={() => updateImage(selSlot, { fit: "fit", scale: 1, ox: 0, oy: 0 })} testID="img-fit" />
              <Chip icon="rotate-ccw" label="Reset" onPress={() => updateImage(selSlot, defaultTransform())} testID="img-reset" />
            </ScrollView>
          ) : null}

          {tool === "replace" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {photos.map((p) => (
                <Pressable key={p.id} testID={`replace-photo-${p.id}`} onPress={() => replaceImage(p.id)} style={[styles.thumb, slotPhotoId === p.id && { borderColor: colors.brandPrimary, borderWidth: 2 }]}>
                  <Image source={{ uri: p.thumbnail_url }} style={{ flex: 1 }} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {tool === "text" ? (
            selectedTextObj ? (
              <View style={{ gap: spacing.sm }}>
                {editingText ? (
                  <TextInput
                    testID="text-input"
                    value={selectedTextObj.text}
                    onChangeText={(v) => updateText({ text: v }, true)}
                    onBlur={() => { setEditingText(false); snapshot(); }}
                    onFocus={snapshot}
                    autoFocus multiline
                    placeholder="Type your text"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                ) : (
                  <Pressable testID="text-edit-button" onPress={() => setEditingText(true)} style={styles.input}><Text style={{ color: colors.onSurface, fontFamily: fonts.text }} numberOfLines={1}>{selectedTextObj.text || "Tap to edit text"}</Text></Pressable>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {FONTS.map((f) => (
                    <Pressable key={f.key} testID={`font-${f.key}`} onPress={() => updateText({ font: f.key })} style={[styles.fontChip, selectedTextObj.font === f.key && styles.chipActive]}>
                      <Text style={{ fontFamily: fontFamilyFor(f.key, "regular"), fontSize: 15, color: selectedTextObj.font === f.key ? colors.onBrandPrimary : colors.onSurface }}>{f.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  <Chip icon="minus" label="Smaller" onPress={() => updateText({ size: Math.max(0.02, +(selectedTextObj.size - 0.006).toFixed(3)) })} testID="text-smaller" />
                  <Chip icon="plus" label="Larger" onPress={() => updateText({ size: Math.min(0.2, +(selectedTextObj.size + 0.006).toFixed(3)) })} testID="text-larger" />
                  <Chip icon="bold" label="Bold" active={selectedTextObj.weight === "bold"} onPress={() => updateText({ weight: selectedTextObj.weight === "bold" ? "regular" : "bold" })} testID="text-bold" />
                  <Chip icon="italic" label="Italic" active={!!selectedTextObj.italic} onPress={() => updateText({ italic: !selectedTextObj.italic })} testID="text-italic" />
                  <Chip icon={selectedTextObj.align === "left" ? "align-left" : selectedTextObj.align === "center" ? "align-center" : "align-right"} label="Align" onPress={() => updateText({ align: selectedTextObj.align === "left" ? "center" : selectedTextObj.align === "center" ? "right" : "left" })} testID="text-align" />
                  <Chip icon="copy" label="Duplicate" onPress={duplicateText} testID="text-duplicate" />
                  <Chip icon="trash-2" label="Delete" onPress={deleteText} testID="text-delete" />
                  <Chip icon="plus-square" label="Add another" onPress={addText} testID="text-add-another" />
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {TEXT_COLORS.map((c) => (
                    <Pressable key={c} testID={`text-color-${c.slice(1)}`} onPress={() => updateText({ color: c })} style={[styles.swatch, { backgroundColor: c }, selectedTextObj.color === c && { borderColor: colors.brandPrimary, borderWidth: 3 }]} />
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.row}><Chip icon="plus" label="+ Add Text" onPress={addText} testID="text-add" /></View>
            )
          ) : null}

          {tool === "layout" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {[1, 2, 3, 4].map((n) => (
                <Pressable key={n} testID={`layout-${n}`} onPress={() => changeLayout(n)} style={[styles.layoutCard, page.photo_ids.length === n && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                  <View style={{ width: 44, height: 44, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }}>
                    {DEFAULT_POSITIONS[n].map((r, i) => <View key={i} style={{ position: "absolute", left: r.x * 44, top: r.y * 44, width: r.w * 44, height: r.h * 44, backgroundColor: colors.borderStrong }} />)}
                  </View>
                  <Text style={{ fontFamily: fonts.text, fontSize: 12, color: colors.onSurface, marginTop: 4 }}>{LAYOUT_NAMES[n]}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {tool === "coverstyle" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {COVER_STYLES.map((c) => (
                <Pressable key={c.key} testID={`cover-style-${c.key}`} onPress={() => setCoverStyle(c.key)} style={[styles.layoutCard, coverKey === c.key && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
                  <View style={{ width: 44, height: 44, backgroundColor: c.background, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ position: "absolute", left: c.frame.x * 44, top: c.frame.y * 44, width: c.frame.w * 44, height: c.frame.h * 44, backgroundColor: colors.borderStrong }} />
                  </View>
                  <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.onSurface, marginTop: 4, textAlign: "center" }}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {tool === "background" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {(bgQ.data?.backgrounds || []).map((b: any) => (
                <Pressable key={b.id} testID={`bg-${b.id}`} onPress={() => commit({ ...page, background: b.color })} style={[styles.swatch, { backgroundColor: b.color, width: 40, height: 40 }, page.background === b.color && { borderColor: colors.brandPrimary, borderWidth: 3 }]} />
              ))}
            </ScrollView>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <Button testID="page-editor-save" label={saving ? "Saving…" : "Save & Preview"} onPress={save} loading={saving} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({ icon, label, onPress, active, testID }: { icon: any; label: string; onPress: () => void; active?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Feather name={icon} size={14} color={active ? colors.onBrandPrimary : colors.onSurface} />
      <Text style={[styles.chipText, active && { color: colors.onBrandPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surfaceTertiary },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBtn: { minHeight: 44, justifyContent: "center" },
  topBtnText: { color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 15 },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  canvasWrap: { backgroundColor: colors.surfaceSecondary, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  handle: { position: "absolute", width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceSecondary },
  sheet: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  toolTab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  toolTabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  toolText: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurface },
  panel: { minHeight: 64, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurface },
  fontChip: { paddingHorizontal: 14, minHeight: 44, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.borderStrong },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  layoutCard: { alignItems: "center", padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, minWidth: 72 },
  input: { marginHorizontal: spacing.md, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontFamily: fonts.text },
});
