import { Fragment, useCallback, useEffect, useRef, useState } from "react";
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

const GAP = spacing.sm;
const SUPPORTED_IMAGE_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i;

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
  // DataTransfer is only reliably readable during the synchronous drop event.
  // Snapshot every individual File and folder entry before awaiting anything.
  const itemFiles: any[] = [];
  const directoryEntries: any[] = [];
  const items = Array.from(dataTransfer?.items || []) as any[];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
    if (entry?.isDirectory && typeof entry.createReader === "function") {
      directoryEntries.push(entry);
      continue;
    }
    const file = item.getAsFile?.();
    if (file) itemFiles.push(file);
  }
  // Snapshot FileList synchronously too. Some browsers expose only one of
  // several dragged files through FileList while DataTransferItem exposes all.
  const fileList = Array.from(dataTransfer?.files || []) as any[];

  const folderGroups = await Promise.all(directoryEntries.map((entry) => filesFromDroppedEntry(entry)));
  // Use the fuller snapshot for individual-file drops; never let a partial
  // FileList override a longer item.getAsFile() list.
  const individualFiles = fileList.length >= itemFiles.length ? fileList : itemFiles;
  const files = [...individualFiles, ...folderGroups.flat()];
  const seenObjects = new Set<any>();
  return files.filter((file) => {
    if (!file || !SUPPORTED_IMAGE_EXTENSION.test(String(file.name || ""))) return false;
    if (seenObjects.has(file)) return false;
    seenObjects.add(file);
    return true;
  });
}

export default function UploadStep() {
  const { albumId, notice, style: keepStyle, coverPhotoId: keepCover } = useLocalSearchParams<{ albumId: string; notice?: string; style?: string; coverPhotoId?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const maxColumns = width >= 1450 ? 12 : width >= 1250 ? 10 : width >= 1000 ? 8 : 6;
  const minColumns = 2;
  const initialColumns = width >= 1400 ? 7 : width >= 1100 ? 6 : width >= 760 ? 5 : 3;
  const [gridColumns, setGridColumns] = useState(initialColumns);
  const columns = Math.max(minColumns, Math.min(gridColumns, maxColumns));
  const cell = Math.floor((width - spacing.xl * 2 - GAP * (columns - 1)) / columns);
  const [zoomTrackWidth, setZoomTrackWidth] = useState(160);
  const setZoomFromEvent = useCallback((event: any) => {
    const locationX = Number(event?.nativeEvent?.locationX ?? 0);
    const ratio = Math.max(0, Math.min(1, locationX / Math.max(1, zoomTrackWidth)));
    setGridColumns(minColumns + Math.round(ratio * (maxColumns - minColumns)));
  }, [maxColumns, zoomTrackWidth]);
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
  const gridListRef = useRef<any>(null);
  const gridScrollOffset = useRef(0);
  const previousColumns = useRef(columns);
  const restoreGridScroll = useRef(false);
  useEffect(() => {
    if (previousColumns.current !== columns) {
      previousColumns.current = columns;
      restoreGridScroll.current = true;
    }
  }, [columns]);

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

    // Limit decoded local previews on iPhone to reduce memory spikes for large batches.
    // Other selected photos use lightweight placeholders until their upload completes.
    const MAX_LOCAL_PREVIEWS = 4;
    const previewBatchKey = Date.now();
    setProgress({ done: 0, total: assets.length });
    setLocalPreviews(assets.map((asset: any, i: number) => ({
      key: "local-preview-" + previewBatchKey + "-" + i,
      index: i,
      localPreview: true,
      localUri: i < MAX_LOCAL_PREVIEWS ? asset.uri : undefined,
      filename: asset.fileName,
    })));
    let failed = 0;
    const failedFiles: string[] = [];
    let nextIndex = 0;
    let completed = 0;
    const uploaded: { index: number; photo: any }[] = [];

    // iOS uploads run one at a time to limit peak memory and native file-handle pressure.
    // Other platforms retain two concurrent requests; server-side derivative work is unchanged.
    const concurrency = Math.min(Platform.OS === "ios" ? 1 : 2, assets.length);
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

  const renderPhoto = useCallback((p: any, index: number) => {
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
        element.removeEventListener("contextmenu", handlers.contextMenu);
        element.removeEventListener("touchstart", handlers.touchStart);
        document.removeEventListener("touchmove", handlers.touchMove);
        document.removeEventListener("touchend", handlers.touchEnd);
        document.removeEventListener("touchcancel", handlers.touchEnd);
        clearTimeout(handlers.longPressTimer);
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
      // Mobile browsers otherwise open the image context menu instead of starting a reorder.
      node.style.webkitTouchCallout = "none";
      node.style.webkitUserSelect = "none";
      const touchState: any = { dragging: false, targetIndex: index, longPressTimer: null as any };

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
      const contextMenu = (event: any) => {
        event.preventDefault();
      };
      const touchStart = (event: any) => {
        const target = event.target as any;
        if (target?.closest?.('button, [role="button"]')) return;
        const touch = event.touches?.[0];
        if (!touch) return;
        touchState.targetIndex = index;
        touchState.dragging = false;
        clearTimeout(touchState.longPressTimer);
        // A short hold starts the drag; ordinary swipes remain available for scrolling.
        touchState.longPressTimer = setTimeout(() => {
          touchState.dragging = true;
          registerActivity();
          node.style.opacity = "0.65";
        }, 280);
      };
      const touchMove = (event: any) => {
        if (!touchState.dragging) {
          const touch = event.touches?.[0];
          if (touch && Math.abs(touch.clientY - (touchState.startY || touch.clientY)) > 10) {
            clearTimeout(touchState.longPressTimer);
          }
          return;
        }
        if (event.cancelable) event.preventDefault();
        const touch = event.touches?.[0];
        if (!touch) return;
        const target = document.elementFromPoint(touch.clientX, touch.clientY) as any;
        const tile = target?.closest?.("[data-photo-id][data-photo-index]");
        if (tile) touchState.targetIndex = Number(tile.getAttribute("data-photo-index"));
      };
      const touchEnd = () => {
        clearTimeout(touchState.longPressTimer);
        const wasDragging = touchState.dragging;
        touchState.dragging = false;
        node.style.opacity = "";
        if (wasDragging && Number.isFinite(touchState.targetIndex)) {
          const target = document.querySelector('[data-photo-id][data-photo-index="' + touchState.targetIndex + '"]') as any;
          const targetId = target?.getAttribute("data-photo-id");
          if (targetId && targetId !== actual.id) void movePhotoTo(actual.id, touchState.targetIndex);
        }
      };
      const contextStart = (event: any) => {
        const touch = event.touches?.[0];
        touchState.startY = touch?.clientY ?? 0;
        touchStart(event);
      };
      node.addEventListener("dragstart", start);
      node.addEventListener("dragover", over);
      node.addEventListener("drop", drop);
      node.addEventListener("contextmenu", contextMenu);
      node.addEventListener("touchstart", contextStart, { passive: true });
      document.addEventListener("touchmove", touchMove, { passive: false });
      document.addEventListener("touchend", touchEnd);
      document.addEventListener("touchcancel", touchEnd);
      node.__clickbookDragHandlers = { start, over, drop, contextMenu, touchStart: contextStart, touchMove, touchEnd, get longPressTimer() { return touchState.longPressTimer; } };
    };

    return (
      <View
        ref={attachNativeDrag}
        style={{ width: cell, height: cell, marginLeft: index % columns === 0 ? 0 : GAP, marginBottom: GAP, cursor: canReorder && Platform.OS === "web" ? "grab" as any : "default" as any }}
        testID={ready ? `upload-photo-${actual.id}` : localPreview ? `upload-local-preview-${index}` : `upload-pending-${index}`}
        pointerEvents="auto"
        onTouchStart={registerActivity}
        {...({ onContextMenu: (event: any) => event.preventDefault() } as any)}
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
            <Pressable disabled={index < columns} onPress={() => movePhoto(actual.id, -columns)} style={styles.reorderButton} accessibilityLabel="Move photo up"><Feather name="chevron-up" size={14} color="#FFF" /></Pressable>
            <Pressable disabled={index % columns === 0} onPress={() => movePhoto(actual.id, -1)} style={styles.reorderButton} accessibilityLabel="Move photo left"><Feather name="chevron-left" size={14} color="#FFF" /></Pressable>
            <Pressable disabled={index % columns === columns - 1 || index === photos.length - 1} onPress={() => movePhoto(actual.id, 1)} style={styles.reorderButton} accessibilityLabel="Move photo right"><Feather name="chevron-right" size={14} color="#FFF" /></Pressable>
            <Pressable disabled={index + columns >= photos.length} onPress={() => movePhoto(actual.id, columns)} style={styles.reorderButton} accessibilityLabel="Move photo down"><Feather name="chevron-down" size={14} color="#FFF" /></Pressable>
          </View>
        ) : null}
      </View>
    );
  }, [cell, columns, movePhoto, movePhotoTo, photos.length, registerActivity, removePhoto, uploading]);


  const gridData = [...photos, ...localPreviews];
  const gridRows = Array.from({ length: Math.ceil(gridData.length / columns) }, (_, rowIndex) => {
    const startIndex = rowIndex * columns;
    const items = gridData.slice(startIndex, startIndex + columns).map((item, offset) => ({
      item, index: startIndex + offset,
    }));
    return {
      key: items.map(({ item, index }) => String(item.id || item.key || index)).join("|"),
      items,
    };
  });
  const renderRow = useCallback(({ item: row }: { item: any }) => (
    <View style={{ flexDirection: "row" }}>
      {row.items.map(({ item, index }: any) => (
        <Fragment key={String(item.id || item.key || index)}>
          {renderPhoto(item, index)}
        </Fragment>
      ))}
    </View>
  ), [renderPhoto]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="upload-back" hitSlop={12}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Step 2 of 3</Text>
        <View style={{ width: 22 }} />
      </View>
      <View style={{ flex: 1 }} {...({ onPointerMove: registerActivity } as any)}>
      <FlatList
        ref={gridListRef as any}
        testID="upload-photo-grid"
        data={gridRows}
        keyExtractor={(row: any) => row.key}
        numColumns={1}
        renderItem={renderRow}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: cell + GAP, offset: (cell + GAP) * index, index })}
        onScroll={(event: any) => { gridScrollOffset.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (restoreGridScroll.current) {
            restoreGridScroll.current = false;
            const offset = gridScrollOffset.current;
            requestAnimationFrame(() => gridListRef.current?.scrollToOffset({ offset, animated: false }));
          }
        }}
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

            <Pressable ref={attachDropzone as any} testID="upload-pick-button" onPress={pickAndUpload} disabled={uploading} style={[styles.dropzone, isDraggingFiles && styles.dropzoneDragging]}>
              {uploading ? (
                <>
                  <ActivityIndicator color={colors.brandPrimary} />
                  <Text style={[s.h2, { marginTop: spacing.sm }]} testID="upload-progress">Uploading {progress!.done} of {progress!.total}</Text>
                  <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((progress!.done / Math.max(1, progress!.total)) * 100)}%` }]} /></View>
                </>
              ) : (
                <>
                  <Feather name="upload-cloud" size={40} color={colors.brandPrimary} />
                  <Text style={[s.h2, { marginTop: spacing.sm }]}>{isDraggingFiles ? "Drop images to upload" : "Add photos"}</Text>
                  <Text style={[s.bodyMuted, { marginTop: 4 }]}>Tap to select, or drag images / an entire folder here</Text>
                </>
              )}
            </Pressable>

            {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="upload-error">{err}</Text> : null}
            {photos.length > 0 ? (
              <View style={styles.gridToolbar} testID="upload-grid-toolbar">
                <Text style={s.label} testID="upload-count">{photos.length} photos</Text>
                <View style={styles.zoomControls}>
                  <Text style={styles.zoomLabel}>Grid size</Text>
                  <Pressable testID="upload-grid-zoom-out" accessibilityLabel="Show fewer, larger thumbnails"
                    disabled={columns <= minColumns} onPress={() => setGridColumns(Math.max(minColumns, columns - 1))}
                    style={[styles.zoomStepButton, columns <= minColumns && styles.zoomStepButtonDisabled]}>
                    <Feather name="minus" size={16} color={colors.onSurface} />
                  </Pressable>
                  <View testID="upload-grid-zoom-slider" accessibilityLabel={"Grid size, " + columns + " columns"}
                    onLayout={(event: any) => setZoomTrackWidth(Math.max(1, event.nativeEvent.layout.width))}
                    onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
                    onResponderGrant={setZoomFromEvent} onResponderMove={setZoomFromEvent}
                    onResponderRelease={setZoomFromEvent} style={styles.zoomSlider}>
                    <View pointerEvents="none" style={styles.zoomTrack} />
                    <View pointerEvents="none" style={[styles.zoomTrackActive, { width: (columns - minColumns) / Math.max(1, maxColumns - minColumns) * 100 + "%" }]} />
                    <View pointerEvents="none" style={[styles.zoomThumb, { left: (columns - minColumns) / Math.max(1, maxColumns - minColumns) * 100 + "%" }]} />
                  </View>
                  <Pressable testID="upload-grid-zoom-in" accessibilityLabel="Show more, smaller thumbnails"
                    disabled={columns >= maxColumns} onPress={() => setGridColumns(Math.min(maxColumns, columns + 1))}
                    style={[styles.zoomStepButton, columns >= maxColumns && styles.zoomStepButtonDisabled]}>
                    <Feather name="plus" size={16} color={colors.onSurface} />
                  </Pressable>
                  <Text style={styles.zoomValue}>{columns} columns</Text>
                </View>
              </View>
            ) : null}
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
  gridToolbar: { marginTop: spacing.xl, marginBottom: spacing.md, gap: spacing.sm },
  zoomControls: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  zoomLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceMuted },
  zoomStepButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  zoomStepButtonDisabled: { opacity: 0.35 },
  zoomSlider: { width: 160, height: 30, justifyContent: "center" },
  zoomTrack: { position: "absolute", left: 0, right: 0, top: 13, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  zoomTrackActive: { position: "absolute", left: 0, top: 13, height: 4, borderRadius: 2, backgroundColor: colors.brandPrimary },
  zoomThumb: { position: "absolute", top: 7, width: 16, height: 16, marginLeft: -8, borderRadius: 8, borderWidth: 2, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  zoomValue: { minWidth: 62, fontFamily: fonts.text, fontSize: 12, color: colors.onSurfaceMuted },
  dropzoneDragging: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
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
