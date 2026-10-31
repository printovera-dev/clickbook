// Focused full-screen page editor (opened by double-tapping a page in the 3D preview).
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, Dimensions, Platform, KeyboardAvoidingView, FlatList } from "react-native";
import * as ImagePicker from "expo-image-picker";
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
import { Thumb } from "@/src/components/thumb";
import {
  Page, Photo, TextObject, CoverDesign, FONTS, TEXT_COLORS, LAYOUT_NAMES, DEFAULT_POSITIONS, COVER_STYLES,
  slotRects, imageDrawRect, defaultTransform, newTextObject, fontFamilyFor, coverToPage, pageToCover, rotatedDims,
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
  const bgQ = useQuery({ queryKey: ["backgrounds"], queryFn: () => api.listBackgrounds() });
  const layoutsQ = useQuery({ queryKey: ["layouts"], queryFn: () => api.listLayouts() });
  const album = albumQ.data?.album;
  useEffect(() => { if (album?.locked) router.replace({ pathname: "/album/[id]/preview", params: { id: String(id) } }); }, [album?.locked, id, router]);
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
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const gestureStart = useRef<any>(null);

  useEffect(() => {
    if (album && !page) {
      if (isCover) {
        const cd: CoverDesign | null = album.cover_design;
        if (cd) {
          const coverPage = coverToPage(cd);
          setPage(coverPage);
          setCoverKey(cd.style || "signature");
          if (initialTool === "text") {
            const existing = coverPage.texts?.[0];
            if (existing) { setSelText(existing.id); setSelSlot(null); setTool("text"); setEditingText(true); }
            else { const t = newTextObject({ z: 1 }); setPage({ ...coverPage, texts: [...(coverPage.texts || []), t] }); setSelText(t.id); setSelSlot(null); setTool("text"); setEditingText(true); }
          } else if (initialTool && ["image", "replace", "coverstyle", "background"].includes(initialTool)) {
            setTool(initialTool as Tool);
          } else if (coverPage.texts?.length) {
            setSelText(coverPage.texts[0].id); setSelSlot(null); setTool("text");
          }
        }
        return;
      }
      const p = album.pages?.[pageIndex];
      if (p) {
        // Older saved pages may store their caption in the legacy `text`
        // field instead of the editable `texts` layer array. Promote it to a
        // normal text object so it can be selected, edited, and saved again.
        const savedTexts = Array.isArray(p.texts) ? p.texts : [];
        const legacyText = typeof p.text === "string" ? p.text.trim() : "";
        const base = {
          ...p,
          images: p.images || {},
          texts: savedTexts.length || !legacyText
            ? savedTexts
            : [newTextObject({ text: p.text!, x: 0.06, y: 0.42, w: 0.88, h: 0.16, size: 0.045, font: "playfair", color: "#FFFFFF", align: "center", z: 1 })],
        };
        if (initialTool === "text") {
          // Re-entering Text from preview should edit an existing saved layer,
          // not silently create a new layer each time.
          const existing = base.texts[base.texts.length - 1];
          if (existing) {
            setPage(base); setSelText(existing.id); setSelSlot(null); setTool("text"); setEditingText(true);
          } else {
            const t = newTextObject({ z: 1 });
            setPage({ ...base, texts: [t] }); setHistory([base]); setSelText(t.id); setSelSlot(null); setTool("text"); setEditingText(true);
          }
        } else { setPage(base); if (initialTool && ["image", "replace", "layout", "background"].includes(initialTool)) setTool(initialTool as Tool); }
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

  // Keep text edits functional: typing can emit several changes before React
  // renders again, so deriving each keystroke from the captured page can drop
  // characters or restore an older value. Cover titles and page text both use
  // the same TextObject model and this one update path.
  const updateText = (patch: Partial<TextObject>, live = false) => {
    if (!selText) return;
    if (live) {
      setPage((prev) => {
        if (!prev) return prev;
        return { ...prev, texts: (prev.texts || []).map((t) => (t.id === selText ? { ...t, ...patch } : t)) };
      });
      return;
    }
    if (!page) return;
    commit({ ...page, texts: (page.texts || []).map((t) => (t.id === selText ? { ...t, ...patch } : t)) });
  };

  // One selection path for cover titles and page text layers.
  const selectTextForEditing = (textId: string) => {
    setSelSlot(null);
    setSelText(textId);
    setTool("text");
    setEditingText(true);
  };
  const updateImage = (slot: number, patch: any, live = false) => {
    if (!page) return;
    const cur = page.images?.[String(slot)] || defaultTransform();
    const next = { ...page, images: { ...(page.images || {}), [String(slot)]: { ...cur, photo_id: page.photo_ids[slot], ...patch } } };
    live ? setPage(next) : commit(next);
  };

  // Fill a single-photo page/cover edge-to-edge, remembering its original frame so Fit restores it.
  const fillImage = (slot: number) => {
    if (!page) return;
    const cur = page.images?.[String(slot)] || defaultTransform();
    const rect = slotRects(page)[slot];
    if (!rect) return;
    const singlePhoto = page.photo_ids.length === 1;
    const nextImage: any = { ...cur, photo_id: page.photo_ids[slot], fit: "fill", scale: 1, ox: 0, oy: 0 };
    let nextPage: Page = { ...page, images: { ...(page.images || {}), [String(slot)]: nextImage } };
    if (singlePhoto) {
      // Always re-apply full-page geometry when Fill is tapped. Do not trust the
      // saved flag alone: another layout action or older saved page may have
      // left the image flagged as filled while its slot is still inset.
      const wasAlreadyFullBleed = Boolean(cur.pageFill) && rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1;
      nextImage.pageFill = true;
      nextImage.restoreSlot = wasAlreadyFullBleed ? cur.restoreSlot : rect;
      nextPage = { ...nextPage, slots: [{ x: 0, y: 0, w: 1, h: 1 }] };
    }
    commit(nextPage);
  };
  const fitImage = (slot: number) => {
    if (!page) return;
    const cur: any = page.images?.[String(slot)] || defaultTransform();
    const nextImage: any = { ...cur, photo_id: page.photo_ids[slot], fit: "fit", scale: 1, ox: 0, oy: 0 };
    const nextPage: Page = { ...page, images: { ...(page.images || {}), [String(slot)]: nextImage } };
    if (cur.pageFill) {
      const slots = [...slotRects(page)];
      const restored = cur.restoreSlot;
      if (restored) slots[slot] = restored;
      delete nextImage.pageFill;
      delete nextImage.restoreSlot;
      nextPage.slots = slots;
    }
    commit(nextPage);
  };

  // ---- image gestures (pan + pinch on the selected slot) ----
  const rects = page ? slotRects(page) : [];
  const slotRect = selSlot != null && rects[selSlot] ? rects[selSlot] : null;
  const slotTr = page && selSlot != null ? (page.images?.[String(selSlot)] || defaultTransform()) : null;
  const slotPhotoId = page && selSlot != null ? page.photo_ids[selSlot] : undefined;
  const slotRawDims = slotPhotoId ? dims.current[slotPhotoId] || (photosById[slotPhotoId]?.width ? { w: photosById[slotPhotoId].width!, h: photosById[slotPhotoId].height! } : null) : null;
  const slotDims = slotRawDims ? rotatedDims(slotRawDims.w, slotRawDims.h, slotTr) : null;
  const rotateImage = () => {
    if (selSlot == null || !slotTr) return;
    updateImage(selSlot, { rotate: ((((slotTr.rotate || 0) + 90) % 360) as 0 | 90 | 180 | 270), ox: 0, oy: 0 });
  };

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
  // Snap guides: page centre, safe margins (5%), and other text objects' edges/centres.
  const SNAP = 0.012;
  const snapAxis = (edges: number[], candidates: number[]) => {
    for (const c of candidates) for (let k = 0; k < edges.length; k++) {
      if (Math.abs(edges[k] - c) < SNAP) return { delta: c - edges[k], line: c };
    }
    return null;
  };
  const onTextMove = (tx: number, ty: number) => {
    const st = gestureStart.current?.t as TextObject | undefined; if (!st || !page) return;
    let x = Math.max(0, Math.min(1 - st.w, st.x + tx / size));
    let y = Math.max(0, Math.min(1 - st.h, st.y + ty / size));
    const others = (page.texts || []).filter((o) => o.id !== st.id);
    const vC = [0.5, 0.05, 0.95, ...others.flatMap((o) => [o.x, o.x + o.w, o.x + o.w / 2])];
    const hC = [0.5, 0.05, 0.95, ...others.flatMap((o) => [o.y, o.y + o.h, o.y + o.h / 2])];
    const sv = snapAxis([x, x + st.w, x + st.w / 2], vC);
    const sh = snapAxis([y, y + st.h, y + st.h / 2], hC);
    if (sv) x += sv.delta;
    if (sh) y += sh.delta;
    setGuides({ v: sv ? [sv.line] : [], h: sh ? [sh.line] : [] });
    updateText({ x, y }, true);
  };
  const clearGuides = () => setGuides({ v: [], h: [] });
  const onTextResize = (tx: number, ty: number) => {
    const st = gestureStart.current?.t as TextObject | undefined; if (!st) return;
    updateText({ w: Math.max(0.15, Math.min(1 - st.x, st.w + tx / size)), h: Math.max(0.06, Math.min(1 - st.y, st.h + ty / size)) }, true);
  };
  const textPan = Gesture.Pan().onStart(() => { "worklet"; runOnJS(onTextStart)(); }).onUpdate((e) => { "worklet"; runOnJS(onTextMove)(e.translationX, e.translationY); }).onEnd(() => { "worklet"; runOnJS(clearGuides)(); });
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
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Backspace" || e.key === "Delete") && selText && !editingText) { e.preventDefault(); deleteText(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selText, editingText, page]);
  const changeLayout = (layout: any) => {
    if (!page) return;
    const count = Number(layout?.photo_count);
    const positions = Array.isArray(layout?.positions) && layout.positions.length === count
      ? layout.positions
      : DEFAULT_POSITIONS[count];
    if (!Number.isInteger(count) || count < 1 || count > 4 || !positions || positions.length !== count) return;

    // Changing a layout must not silently pull in other album photos.
    // Preserve this page's existing images and leave any new slots empty so
    // the customer can choose exactly which photo belongs in each new slot.
    const ids = page.photo_ids.slice(0, count);
    while (ids.length < count) ids.push("");
    const images: Record<string, any> = {};
    ids.forEach((pid, i) => {
      const prev = page.images?.[String(i)];
      images[String(i)] = pid
        ? (prev && prev.photo_id === pid ? prev : { ...defaultTransform(), photo_id: pid })
        : { ...defaultTransform(), photo_id: "" };
    });
    commit({
      ...page,
      layout_id: layout.id,
      photo_ids: ids,
      layout_photo_count: count,
      slots: positions,
      images,
    });
    setSelSlot(0);
  };
  const replaceImage = (pid: string) => {
    if (!page || selSlot == null) return;
    const ids = [...page.photo_ids]; ids[selSlot] = pid;
    commit({ ...page, photo_ids: ids, images: { ...(page.images || {}), [String(selSlot)]: { ...defaultTransform(), photo_id: pid } } });
  };
  const [uploadingNew, setUploadingNew] = useState(false);
  const uploadNewImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 1, exif: false, base64: false,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUploadingNew(true);
    try {
      const r = await api.uploadPhoto(String(id), a.uri, a.fileName || `photo_${Date.now()}.jpg`, (a as any).file);
      qc.setQueryData(["album", id], (old: any) => old ? { ...old, album: { ...old.album, photos: [...(old.album.photos || []), r.photo] } } : old);
      replaceImage(r.photo.id);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Please try again");
    } finally { setUploadingNew(false); }
  };
  const setCoverStyle = (key: string) => {
    if (!page) return;
    const st = COVER_STYLES.find((c) => c.key === key); if (!st) return;
    // New frame → reset the crop so the photo drops cleanly into the new template (no stale offsets / layout jump).
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
      // Do not leave the editor unless the server confirms the cover was persisted.
      if (isCover && !r?.album?.cover_design) {
        throw new Error("The server did not confirm the cover save. Your edits are still on this screen; please retry.");
      }
      qc.setQueryData(["album", id], r);
      await qc.invalidateQueries({ queryKey: ["album", id] });
      await qc.invalidateQueries({ queryKey: ["albums"] });
      // Preserve the edited location when returning from the page/cover editor.
      router.replace({ pathname: "/album/[id]/preview", params: { id: String(id), focusIndex: isCover ? "cover" : String(pageIndex) } });
    } catch (e: any) {
      const message = e?.message || "Please try again";
      if (Platform.OS === "web" && typeof window !== "undefined") window.alert(`Could not save: ${message}`);
      else Alert.alert("Could not save", message);
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
    { key: "text", icon: "type", label: isCover ? "Change Cover Text" : "Add Text" },
    isCover ? { key: "coverstyle", icon: "book", label: "Change Cover Style" } : { key: "layout", icon: "grid", label: "Change Layout" },
    { key: "background", icon: "droplet", label: "Background" },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.topbar}>
        <Pressable onPress={cancel} testID="page-editor-cancel" style={styles.topBtn}><Text style={styles.topBtnText}>Cancel</Text></Pressable>
        <Text style={s.label} testID="page-editor-title">{isCover ? "Edit Cover" : `Edit Page ${pageIndex + 1} of ${album?.pages?.length || 0}`}</Text>
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
            onSlotPress={(i) => {
              setSelSlot(i);
              setSelText(null);
              if (!page.photo_ids?.[i]) setTool("replace");
              else if (tool === "text") setTool("image");
            }}
            emptySlotLabel="Change Image"
            onTextPress={(tid) => {
              if (tid === "__legacy_text__") {
                // Promote old caption-only pages into the same editable text
                // layer model used by cover titles, then select that exact layer.
                const existing = page.texts?.[0];
                if (existing) {
                  selectTextForEditing(existing.id);
                } else {
                  const t = newTextObject({ text: page.text || "", x: 0.06, y: 0.42, w: 0.88, h: 0.16, size: 0.045, font: "playfair", color: "#FFFFFF", align: "center", z: 1 });
                  commit({ ...page, texts: [t], text: undefined });
                  selectTextForEditing(t.id);
                }
              } else {
                selectTextForEditing(tid);
              }
            }}
            onImageDims={(pid, w, h) => { dims.current[pid] = { w, h }; }}
          />
          {/* Parent-level hit targets route saved text taps directly to selection. */}
          {(page.texts || []).filter((t) => t.id !== selText).map((t) => (
            <Pressable key={`text-hit-${t.id}`} testID={`saved-text-hit-${t.id}`} onPress={() => selectTextForEditing(t.id)}
              style={{ position: "absolute", left: t.x * size, top: t.y * size, width: t.w * size, height: t.h * size, zIndex: 60 + (t.z || 0), elevation: 60 + (t.z || 0), backgroundColor: "transparent" }} />
          ))}
          {page.text && !(page.texts || []).length ? (
            <Pressable testID="saved-legacy-text-hit" onPress={() => {
              const t = newTextObject({ text: page.text || "", x: 0.06, y: 0.42, w: 0.88, h: 0.16, size: 0.045, font: "playfair", color: "#FFFFFF", align: "center", z: 1 });
              commit({ ...page, texts: [t], text: undefined }); selectTextForEditing(t.id);
            }} style={{ position: "absolute", left: size * 0.06, right: size * 0.06, bottom: size * 0.04, height: size * 0.16, zIndex: 60, elevation: 60, backgroundColor: "transparent" }} />
          ) : null}
          {/* Snap guides */}
          {guides.v.map((v) => <View key={`v${v}`} pointerEvents="none" style={{ position: "absolute", left: v * size - 0.5, top: 0, width: 1, height: size, backgroundColor: colors.brandPrimary, zIndex: 50 }} />)}
          {guides.h.map((h) => <View key={`h${h}`} pointerEvents="none" style={{ position: "absolute", top: h * size - 0.5, left: 0, height: 1, width: size, backgroundColor: colors.brandPrimary, zIndex: 50 }} />)}
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
              {/* Always-available Delete Text action, right on the selected text layer */}
              <Pressable testID="page-editor-text-delete" onPress={deleteText} hitSlop={6} style={[styles.handle, styles.deleteHandle, { left: Math.max(0, selectedTextObj.x * size - 16), top: Math.max(0, selectedTextObj.y * size - 16) }]}>
                <Feather name="trash-2" size={13} color="#FFF" />
              </Pressable>
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
            <Pressable key={t.key} testID={`page-tool-${t.key}`} onPress={() => {
              if (t.key === "text") {
                // The Text toolbar action must re-open saved text for editing.
                // Only create a new layer when this page has no saved text.
                const texts = page?.texts || [];
                const target = selectedTextObj || (isCover ? texts[0] : texts[texts.length - 1]);
                if (target) {
                  setSelText(target.id); setSelSlot(null); setTool("text"); setEditingText(true);
                } else {
                  addText();
                }
              } else {
                setTool(t.key); setSelText(null); setEditingText(false);
                if ((t.key === "image" || t.key === "replace") && selSlot == null) setSelSlot(0);
              }
            }}
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
              <Chip icon="rotate-cw" label="Rotate 90°" onPress={rotateImage} testID="img-rotate" />
              <Chip icon="maximize" label="Fill" active={slotTr.fit !== "fit" || Boolean((slotTr as any).pageFill)} onPress={() => fillImage(selSlot)} testID="img-fill" />
              <Chip icon="minimize" label="Fit" active={slotTr.fit === "fit" && !Boolean((slotTr as any).pageFill)} onPress={() => fitImage(selSlot)} testID="img-fit" />
              <Chip icon="rotate-ccw" label="Reset" onPress={() => updateImage(selSlot, defaultTransform())} testID="img-reset" />
            </ScrollView>
          ) : null}

          {tool === "replace" ? (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={true}
              data={photos}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={3}
              removeClippedSubviews
              extraData={slotPhotoId}
              contentContainerStyle={styles.row}
              ListHeaderComponent={
                <Pressable testID="replace-upload-new" onPress={uploadNewImage} disabled={uploadingNew} style={[styles.thumb, { alignItems: "center", justifyContent: "center", borderStyle: "dashed", borderColor: colors.brandPrimary }]}>
                  <Feather name={uploadingNew ? "loader" : "upload"} size={18} color={colors.brandPrimary} />
                  <Text style={{ fontFamily: fonts.text, fontSize: 9, color: colors.brandPrimary, marginTop: 2, textAlign: "center" }}>{uploadingNew ? "Uploading" : "Upload new"}</Text>
                </Pressable>
              }
              renderItem={({ item: p }) => (
                <Pressable testID={`replace-photo-${p.id}`} onPress={() => replaceImage(p.id)} style={[styles.thumb, slotPhotoId === p.id && { borderColor: colors.brandPrimary, borderWidth: 2 }]}>
                  <Thumb uri={p.thumbnail_url} recyclingKey={p.id} style={{ flex: 1 }} />
                </Pressable>
              )}
            />
          ) : null}

          {tool === "text" ? (
            selectedTextObj ? (
              <View style={{ gap: spacing.sm }}>
                {editingText ? (
                  <TextInput
                    testID="text-input"
                    value={selectedTextObj.text}
                    onChangeText={(v) => updateText({ text: v }, true)}
                    onBlur={() => setEditingText(false)}
                    autoFocus
                    multiline
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
            <View>
              <Text style={{ fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceMuted, paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
                {layoutsQ.data?.total ?? layoutsQ.data?.layouts?.length ?? 4} available layouts
              </Text>
              <ScrollView
                style={{ maxHeight: 196 }}
                showsVerticalScrollIndicator
                contentContainerStyle={styles.layoutGrid}
                testID="page-editor-layout-list"
              >
                {(layoutsQ.data?.layouts?.length
                  ? layoutsQ.data.layouts.filter((layout: any) =>
                      layout.active !== false &&
                      Number.isInteger(Number(layout.photo_count)) &&
                      Number(layout.photo_count) >= 1 &&
                      Number(layout.photo_count) <= 4 &&
                      Array.isArray(layout.positions) &&
                      layout.positions.length === Number(layout.photo_count)
                    )
                  : Object.entries(DEFAULT_POSITIONS).map(([count, positions]) => ({
                      id: `fallback-${count}`,
                      name: LAYOUT_NAMES[Number(count)],
                      photo_count: Number(count),
                      positions,
                    }))
                ).map((layout: any) => {
                  const positions: any[] = layout.positions;
                  const selected = page.layout_id === layout.id ||
                    JSON.stringify(page.slots || []) === JSON.stringify(positions);
                  return (
                    <Pressable
                      key={layout.id}
                      testID={`layout-${layout.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Apply layout ${layout.name}, ${layout.photo_count} photos`}
                      onPress={() => changeLayout(layout)}
                      style={[
                        styles.layoutCard,
                        styles.availableLayoutCard,
                        selected && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
                      ]}
                    >
                      <View style={{ width: 44, height: 44, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }}>
                        {positions.map((slot: any, i: number) => (
                          <View
                            key={i}
                            style={{
                              position: "absolute",
                              left: slot.x * 44,
                              top: slot.y * 44,
                              width: slot.w * 44,
                              height: slot.h * 44,
                              backgroundColor: colors.borderStrong,
                            }}
                          />
                        ))}
                      </View>
                      <Text
                        numberOfLines={2}
                        style={{ fontFamily: fonts.text, fontSize: 11, color: colors.onSurface, marginTop: 4, textAlign: "center" }}
                      >
                        {layout.name}
                      </Text>
                      <Text style={{ fontFamily: fonts.text, fontSize: 10, color: colors.onSurfaceMuted }}>
                        {layout.photo_count} photo{layout.photo_count === 1 ? "" : "s"}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {layoutsQ.isError ? (
                <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.error, paddingHorizontal: spacing.md }}>
                  Could not load the full layout catalogue. Showing basic layouts instead.
                </Text>
              ) : null}
            </View>
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
  canvasWrap: { backgroundColor: colors.surfaceSecondary, ...(Platform.OS === "web" ? { boxShadow: "0 8px 16px rgba(0,0,0,0.15)" } as any : { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }) },
  handle: { position: "absolute", width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceSecondary },
  deleteHandle: { backgroundColor: colors.error, zIndex: 60 },
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
  availableLayoutCard: { width: 108, minWidth: 108, minHeight: 94, justifyContent: "flex-start" },
  layoutGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  input: { marginHorizontal: spacing.md, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontFamily: fonts.text },
});
