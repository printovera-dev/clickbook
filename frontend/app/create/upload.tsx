import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, useWindowDimensions, Platform, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Thumb } from "@/src/components/thumb";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

const COLS = 3;
const GAP = spacing.sm;
const SUPPORTED_IMAGE_EXTENSION = /\\.(jpe?g|png|webp|heic|heif)$/i;

async function filesFromDroppedEntry(entry: any): Promise<any[]> {
  if (!entry) return [];
  if (entry.isFile) {
    const file = await new Promise<any>((resolve, reject) => entry.file(resolve, reject));
    return file ? [file] : [];
  }
  if (!entry.isDirectory || typeof entry.createReader !== "function") return [];
  const reader = entry.createReader();
  const children: any[] = [];
  while (true) {
    const batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const groups = await Promise.all(children.map((child) => filesFromDroppedEntry(child)));
  return groups.flat();
}

async function getDroppedImageFiles(dataTransfer: any): Promise<any[]> {
  const files: any[] = [];
  const items = Array.from(dataTransfer?.items || []) as any[];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry) {
      files.push(...await filesFromDroppedEntry(entry));
    } else {
      const file = item.getAsFile?.();
      if (file) files.push(file);
    }
  }
  if (!files.length) files.push(...Array.from(dataTransfer?.files || []) as any[]);
  const seen = new Set<any>();
  return files.filter((file) => {
    if (!file || seen.has(file)) return false;
    seen.add(file);
    return SUPPORTED_IMAGE_EXTENSION.test(String(file.name || ""));
  });
}

export default function UploadStep() {
  const { albumId, notice, style: keepStyle, coverPhotoId: keepCover } = useLocalSearchParams<{ albumId: string; notice?: string; style?: string; coverPhotoId?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - spacing.xl * 2 - GAP * (COLS - 1)) / COLS);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [localPreviews, setLocalPreviews] = useState<any[]>([]);
  const [hintVisible, setHintVisible] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [err, setErr] = useState("");
  const hintTimer = useRef<any>(null);
  const dragDepth = useRef(0);
  const uploadInProgress = useRef(false);
  const dropzoneNode = useRef<any>(null);
  const dropzoneHandlers = useRef<any>(null);
  const uploadAssetsRef = useRef<(assets: any[]) => Promise<void>>(async () => {});

  const registerActivity = useCallback(() => {
    setHintVisible(false);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintVisible(true), 50000);
  }, []);

  useEffect(() => {
    hintTimer.current = setTimeout(() => setHintVisible(true), 50000);
    return () => clearTimeout(hintTimer.current);
  }, []);

  const q = useQuery({ queryKey: ["album", albumId], queryFn: () => api.getAlbum(String(albumId)), enabled: !!albumId });
  const photos: any[] = q.data?.album?.photos || [];

  const uploadAssets = useCallback(async (selectedAssets: any[]) => {
    if (!selectedAssets || selectedAssets.length === 0 || uploadInProgress.current) return;
    uploadInProgress.current = true;
    setErr("");
    const ownedObjectUrls: string[] = [];
    const assets = selectedAssets.map((asset: any, i: number) => {
      const file = asset.file || (Platform.OS === "web" && asset.name && typeof asset.size === "number" ? asset : undefined);
      let uri = asset.uri;
      if (!uri && file && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        uri = URL.createObjectURL(file);
        ownedObjectUrls.push(uri);
      }
      return {
        ...asset,
        uri,
        file,
        fileName: asset.fileName || asset.name || ("photo_" + Date.now() + "_" + i + ".jpg"),
      };
    }).filter((asset: any) => !!asset.uri);

    if (!assets.length) {
      setErr("No readable images were selected. Please choose JPG, PNG, WebP, HEIC or HEIF images.");
      ownedObjectUrls.forEach((uri) => URL.revokeObjectURL(uri));
      uploadInProgress.current = false;
      return;
    }

    setLocalPreviews(assets.map((asset: any, i: number) => ({
      key: "local-preview-" + Date.now() + "-" + i,
      index: i,
      localPreview: true,
      localUri: asset.uri,
      filename: asset.fileName,
    })));
    setProgress({ done: 0, total: assets.length });
    let failed = 0;
    const failedFiles: string[] = [];
    let nextIndex = 0;
    let completed = 0;
    const uploaded: { index: number; photo: any }[] = [];

    // Completion creates print derivatives server-side; two parallel requests avoid
    // overwhelming the small backend while keeping direct S3 PUTs concurrent.
    const concurrency = Math.min(2, assets.length);
    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= assets.length) return;
        const asset = assets[i];
        try {
          const r = await api.uploadPhoto(String(albumId), asset.uri, asset.fileName, asset.file);
          uploaded.push({ index: i, photo: r.photo });
          setLocalPreviews((prev) => prev.map((item) => item.index === i ? { ...item, completedPhoto: r.photo } : item));
        } catch (e: any) {
          failed += 1;
          failedFiles.push(asset.fileName);
          console.warn("ClickBook upload failed for " + asset.fileName + ":", e);
        } finally {
          completed += 1;
          setProgress({ done: completed, total: assets.length });
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      uploaded.sort((a, b) => a.index - b.index);
      if (uploaded.length) {
        const existing: any[] = q.data?.album?.photos || [];
        const orderedUploaded = uploaded.map((item) => item.photo);
        const finalPhotos = [...existing, ...orderedUploaded];
        try {
          await api.reorderPhotos(String(albumId), finalPhotos.map((p) => p.id));
        } catch (e) {
          console.warn("Uploads succeeded but saving the selected order failed.", e);
          setErr("Photos uploaded, but the order could not be saved. Refresh and check the sequence.");
        }
        qc.setQueryData(["album", albumId], (old: any) => old
          ? { ...old, album: { ...old.album, photos: finalPhotos } }
          : old);
      }
      await q.refetch();
      setLocalPreviews([]);
      if (failed > 0) {
        const examples = failedFiles.slice(0, 3).join(", ");
        setErr(failed + " of " + assets.length + " photos failed after retries"
          + (examples ? ": " + examples : "") + ". Re-select only those photos to retry.");
      }
    } catch (e: any) {
      setErr(e?.message || "Upload failed. Please retry.");
    } finally {
      setProgress(null);
      setLocalPreviews([]);
      ownedObjectUrls.forEach((uri) => {
        try { URL.revokeObjectURL(uri); } catch {}
      });
      uploadInProgress.current = false;
    }
  }, [albumId, q, qc]);

  useEffect(() => {
    uploadAssetsRef.current = uploadAssets;
  }, [uploadAssets]);

  const pickAndUpload = async () => {
    setErr("");
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { setErr("Photo permission required"); return; }
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        orderedSelection: true,
        quality: 1,
        exif: false,
        base64: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (res.canceled) return;
      await uploadAssets(res.assets);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    }
  };

  const attachDropzone = useCallback((node: any) => {
    const previous = dropzoneNode.current;
    const old = dropzoneHandlers.current;
    if (previous && old) {
      previous.removeEventListener("dragenter", old.enter);
      previous.removeEventListener("dragover", old.over);
      previous.removeEventListener("dragleave", old.leave);
      previous.removeEventListener("drop", old.drop);
    }
    dropzoneNode.current = node;
    dropzoneHandlers.current = null;
    if (Platform.OS !== "web" || !node || typeof node.addEventListener !== "function") return;

    const enter = (event: any) => {
      if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
      event.preventDefault();
      dragDepth.current += 1;
      setIsDraggingFiles(true);
    };
    const over = (event: any) => {
      if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const leave = (event: any) => {
      event.preventDefault?.();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setIsDraggingFiles(false);
    };
    const drop = async (event: any) => {
      event.preventDefault();
      event.stopPropagation?.();
      dragDepth.current = 0;
      setIsDraggingFiles(false);
      if (uploadInProgress.current) {
        setErr("Please wait for the current upload batch to finish before adding more photos.");
        return;
      }
      try {
        const files = await getDroppedImageFiles(event.dataTransfer);
        if (!files.length) {
          setErr("No supported images found. Drop JPG, JPEG, PNG, WebP, HEIC or HEIF files, or a folder containing them.");
          return;
        }
        const assets = files.map((file: any) => ({
          name: file.name,
          fileName: file.name,
          fileSize: file.size,
          file,
          uri: URL.createObjectURL(file),
        }));
        await uploadAssetsRef.current(assets);
      } catch (e: any) {
        setErr(e?.message || "Could not read the dropped files");
      }
    };
    node.addEventListener("dragenter", enter);
    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    dropzoneHandlers.current = { enter, over, leave, drop };
  }, []);

  const movePhotoTo = useCallback(async (photoId: string, targetIndex: number) => {
    registerActivity();
    const current: any[] = q.data?.album?.photos || [];
    const from = current.findIndex((p) => p.id === photoId);
    if (from < 0 || targetIndex < 0 || targetIndex >= current.length || from === targetIndex) return;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(Math.min(targetIndex, next.length), 0, item);
    qc.setQueryData(["album", albumId], (old: any) => old ? { ...old, album: { ...old.album, photos: next } } : old);
    setSavingOrder(true);
    try {
      await api.reorderPhotos(String(albumId), next.map((p) => p.id));
    } catch (e: any) {
      setErr(e?.message || "Could not save photo order");
      await q.refetch();
    } finally {
      setSavingOrder(false);
    }
  }, [albumId, q, qc, registerActivity]);



  const movePhoto = useCallback(async (photoId: string, delta: number) => {
    const current: any[] = q.data?.album?.photos || [];
    const from = current.findIndex((p) => p.id === photoId);
    if (from < 0) return;
    await movePhotoTo(photoId, from + delta);
  }, [movePhotoTo, q]);

  const removePhoto = useCallback(async (pid: string) => {
    qc.setQueryData(["album", albumId], (old: any) => old ? { ...old, album: { ...old.album, photos: (old.album.photos || []).filter((p: any) => p.id !== pid) } } : old);
    await api.deletePhoto(String(albumId), pid);
    q.refetch();
  }, [albumId, q, qc]);

  const generate = async () => {
    registerActivity();
    if (photos.length === 0) { setErr("Please upload at least 1 photo"); return; }
    keepStyle
      ? router.replace({ pathname: "/create/generating", params: { albumId: String(albumId), style: String(keepStyle), coverPhotoId: String(keepCover || "") } })
      : router.replace({ pathname: "/create/style", params: { albumId: String(albumId) } });
  };

  const uploading = !!progress;

  const renderItem = useCallback(({ item: p, index }: { item: any; index: number }) => {
    const completedPhoto = p.completedPhoto;
    const actual = completedPhoto || p;
    const ready = !!actual.id && !!actual.thumbnail_url && !p.pending;
    const localPreview = !!p.localPreview && !!p.localUri && !completedPhoto;
    const canReorder = ready && !uploading;
    // Use native HTML drag-and-drop only (no pointer/mouse tracking for reordering).
    // Attach listeners to the DOM element emitted by React Native Web.
    let attachedNode: any = null;
    const attachNativeDrag = (node: any) => {
      const cleanup = (element: any) => {
        const handlers = element?.__clickbookDragHandlers;
        if (!handlers) return;
        element.removeEventListener("dragstart", handlers.start);
        element.removeEventListener("dragover", handlers.over);
        element.removeEventListener("drop", handlers.drop);
        delete element.__clickbookDragHandlers;
        element.draggable = false;
      };
      if (attachedNode) cleanup(attachedNode);
      attachedNode = node;
      if (Platform.OS !== "web" || !node || !canReorder || !actual.id || typeof node.addEventListener !== "function") return;

      node.draggable = true;
      node.setAttribute("data-photo-id", actual.id);
      node.setAttribute("data-photo-index", String(index));
      node.style.cursor = "grab";

      const start = (event: any) => {
        if ((event.target as any)?.closest?.('button, [role="button"]')) {
          event.preventDefault();
          return;
        }
        registerActivity();
        try {
          event.dataTransfer?.setData("text/plain", actual.id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        } catch {}
      };
      const over = (event: any) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      };
      const drop = (event: any) => {
        event.preventDefault();
        const draggedId = event.dataTransfer?.getData("text/plain");
        if (draggedId && draggedId !== actual.id) void movePhotoTo(draggedId, index);
      };
      node.addEventListener("dragstart", start);
      node.addEventListener("dragover", over);
      node.addEventListener("drop", drop);
      node.__clickbookDragHandlers = { start, over, drop };
    };

    return (
      <View
        ref={attachNativeDrag}
        style={{ width: cell, height: cell, marginLeft: index % COLS === 0 ? 0 : GAP, marginBottom: GAP, cursor: canReorder && Platform.OS === "web" ? "grab" as any : "default" as any }}
        testID={ready ? `upload-photo-${actual.id}` : localPreview ? `upload-local-preview-${index}` : `upload-pending-${index}`}
        pointerEvents="auto"
        onTouchStart={registerActivity}
        {...({
        } as any)}
      >
        {ready ? <Thumb uri={actual.thumbnail_url} recyclingKey={actual.id} style={styles.thumb} /> : localPreview ? (
          <View style={styles.thumb}>
            <Image source={{ uri: p.localUri }} style={styles.localImage} resizeMode="cover" />
            <View style={styles.previewSpinner}><ActivityIndicator color="#FFF" size="small" /></View>
          </View>
        ) : (
          <View style={[styles.thumb, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>
        )}
        {index === 0 && (ready || localPreview) ? (
          <View style={styles.coverBadge} pointerEvents="none">
            <Text style={styles.coverBadgeText}>COVER IMAGE</Text>
          </View>
        ) : null}
        {ready ? (
          <View style={styles.thumbRemove}>
            <Pressable onPress={() => removePhoto(actual.id)} testID={`upload-remove-${actual.id}`} hitSlop={6}>
              <Feather name="x" size={14} color="#FFF" />
            </Pressable>
          </View>
        ) : null}
        {canReorder ? (
          <View style={styles.reorderControls}>
            <Pressable disabled={index < COLS} onPress={() => movePhoto(actual.id, -COLS)} style={styles.reorderButton} accessibilityLabel="Move photo up"><Feather name="chevron-up" size={14} color="#FFF" /></Pressable>
            <Pressable disabled={index % COLS === 0} onPress={() => movePhoto(actual.id, -1)} style={styles.reorderButton} accessibilityLabel="Move photo left"><Feather name="chevron-left" size={14} color="#FFF" /></Pressable>
            <Pressable disabled={index % COLS === COLS - 1 || index === photos.length - 1} onPress={() => movePhoto(actual.id, 1)} style={styles.reorderButton} accessibilityLabel="Move photo right"><Feather name="chevron-right" size={14} color="#FFF" /></Pressable>
            <Pressable disabled={index + COLS >= photos.length} onPress={() => movePhoto(actual.id, COLS)} style={styles.reorderButton} accessibilityLabel="Move photo down"><Feather name="chevron-down" size={14} color="#FFF" /></Pressable>
          </View>
        ) : null}
      </View>
    );
  }, [cell, movePhoto, movePhotoTo, photos.length, registerActivity, removePhoto, uploading]);


  const gridData = [...photos, ...localPreviews];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="upload-back" hitSlop={12}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Step 2 of 3</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={{ flex: 1 }} {...({ onPointerMove: registerActivity } as any)}>
      <FlatList
        testID="upload-photo-grid"
        data={gridData}
        keyExtractor={(p: any) => p.id || p.key}
        numColumns={COLS}
        renderItem={renderItem}
        // virtualization: only ~2 screens of thumbnails are mounted; off-screen rows are released
        initialNumToRender={12}
        maxToRenderPerBatch={9}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: cell + GAP, offset: (cell + GAP) * Math.floor(index / COLS), index })}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
        ListHeaderComponent={
          <View>
            <Text style={s.h1}>Upload your photos</Text>
            {notice ? (
              <View testID="upload-notice" style={styles.notice}>
                <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.text, fontWeight: "600" }}>More photos needed</Text>
                <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.text, marginTop: 4 }}>{notice}</Text>
                <Text style={[s.bodyMuted, { marginTop: 4 }]}>Your uploaded photos are kept — just add more and continue.</Text>
              </View>
            ) : null}
            <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Pick from your gallery — as many as you like. We&apos;ll design the album automatically.</Text>

            <Pressable testID="upload-pick-button" onPress={pickAndUpload} disabled={uploading} style={styles.dropzone}>
              {uploading ? (
                <>
                  <ActivityIndicator color={colors.brandPrimary} />
                  <Text style={[s.h2, { marginTop: spacing.sm }]} testID="upload-progress">Uploading {progress!.done} of {progress!.total}</Text>
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((progress!.done / Math.max(1, progress!.total)) * 100)}%` }]} /></View>
                </>
              ) : (
                <>
                  <Feather name="upload-cloud" size={40} color={colors.brandPrimary} />
                  <Text style={[s.h2, { marginTop: spacing.sm }]}>Add photos</Text>
                  <Text style={[s.bodyMuted, { marginTop: 4 }]}>Tap to select from gallery</Text>
                </>
              )}
            </Pressable>

            {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="upload-error">{err}</Text> : null}
            {photos.length > 0 ? <Text style={[s.label, { marginTop: spacing.xl, marginBottom: spacing.md }]} testID="upload-count">{photos.length} photos</Text> : null}
          </View>
        }
      />
      {hintVisible && !uploading ? (
        <View pointerEvents="none" style={styles.sequenceHint}>
          <Text style={styles.sequenceHintText}>Move the image sequence as you want it in your album</Text>
        </View>
      ) : null}
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="upload-generate-button" label={`Design my album (${photos.length} photos)`} onPress={generate} disabled={photos.length === 0 || uploading || savingOrder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  notice: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary },
  dropzone: {
    marginTop: spacing.xl,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderStyle: "dashed" as any,
    borderRadius: radius.md,
    padding: spacing.xxl,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  bar: { marginTop: spacing.md, width: "100%", height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 4, backgroundColor: colors.brandPrimary },
  thumb: { width: "100%", height: "100%", borderRadius: radius.sm },
  localImage: { width: "100%", height: "100%", borderRadius: radius.sm },
  previewSpinner: { position: "absolute", right: 5, bottom: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  coverBadge: { position: "absolute", top: 4, left: 34, right: 34, alignItems: "center", backgroundColor: "rgba(24,24,24,0.78)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 5 },
  coverBadgeText: { color: "#FFF", fontSize: 9, lineHeight: 11, fontWeight: "700", letterSpacing: 1.1 },
  reorderControls: { position: "absolute", left: 3, right: 3, bottom: 3, flexDirection: "row", justifyContent: "space-between", gap: 2 },
  reorderButton: { width: 23, height: 23, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.68)", alignItems: "center", justifyContent: "center" },
  sequenceHint: { position: "absolute", top: "42%", left: spacing.xl, right: spacing.xl, alignItems: "center", justifyContent: "center" },
  sequenceHintText: { color: "#FFF", backgroundColor: "rgba(20,20,20,0.82)", borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, textAlign: "center", fontFamily: fonts.text, fontWeight: "600" },
  thumbRemove: {
    position: "absolute", top: 4, right: 4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(28,25,23,0.7)", alignItems: "center", justifyContent: "center",
  },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
});
