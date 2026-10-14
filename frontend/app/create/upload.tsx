import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, useWindowDimensions, Alert, Platform, Image, Animated, Easing } from "react-native";
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
  const [hoveredQualityId, setHoveredQualityId] = useState<string | null>(null);
  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const hintTimer = useRef<any>(null);
  const qualityBlink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(qualityBlink, { toValue: 0.25, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(qualityBlink, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [qualityBlink]);

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

  const pickAndUpload = async () => {
    setErr("");
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr("Photo permission required"); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        orderedSelection: true,
        // quality < 1 makes the picker decode + re-encode EVERY selected photo in memory at once
        // (≈48 MB per 12 MP frame) — that is what killed Expo Go at ~30 photos. The server makes
        // all derivatives, so we hand the files through untouched.
        quality: 1,
        exif: false,
        base64: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (res.canceled) return;
      // Do not silently drop selected photos based only on matching filenames and sizes.
      // Different wedding photos from different cameras can share both; upload every
      // selected asset in the exact picker order.
      const assets = res.assets;
      if (!assets.length) return;
      // Show the selected photos immediately, while uploads and server derivatives run.
      setLocalPreviews(assets.map((asset, i) => ({
        key: `local-preview-${Date.now()}-${i}`,
        index: i,
        localPreview: true,
        localUri: asset.uri,
        size_bytes: asset.fileSize || 0,
        filename: asset.fileName || `photo_${i}.jpg`,
      })));
      setProgress({ done: 0, total: assets.length });
      let failed = 0;
      let lastError = "";
      const failedNames: string[] = [];
      let nextIndex = 0;
      let completed = 0;
      const uploaded: { index: number; photo: any }[] = [];
      // Three concurrent uploads improve throughput while keeping memory and backend
      // image-processing load bounded. Each failed upload gets one retry for transient
      // network interruptions; a permanent failure is reported with its filename.
      const concurrency = Math.min(3, assets.length);
      const worker = async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= assets.length) return;
          const asset = assets[i];
          const name = asset.fileName || `photo_${Date.now()}_${i}.jpg`;
          try {
            let r: any;
            let firstError: any = null;
            try {
              r = await api.uploadPhoto(String(albumId), asset.uri, name, (asset as any).file);
            } catch (e: any) {
              firstError = e;
              // Retry once for a dropped connection / transient gateway issue.
              // Do not retry clear client validation errors such as unsupported type or too-large files.
              const message = String(e?.message || "").toLowerCase();
              const status = Number(e?.status || 0);
              const retryable = !status || status === 408 || status === 429 || status >= 500 ||
                message.includes("failed to fetch") || message.includes("network");
              if (!retryable) throw e;
              await new Promise((resolve) => setTimeout(resolve, 700));
              r = await api.uploadPhoto(String(albumId), asset.uri, name, (asset as any).file);
            }
            uploaded.push({ index: i, photo: r.photo });
            setLocalPreviews((prev) => prev.map((item) => item.index === i ? { ...item, completedPhoto: r.photo } : item));
          } catch (e: any) {
            failed += 1;
            lastError = e?.message || "upload failed";
            failedNames.push(name);
          } finally {
            completed += 1;
            setProgress({ done: completed, total: assets.length });
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      // Insert successful uploads in the user's selected order, regardless of which
      // network requests finished first. Keep partial successes if any files failed.
      uploaded.sort((a, b) => a.index - b.index);
      if (uploaded.length) {
        const existing: any[] = q.data?.album?.photos || [];
        const orderedUploaded = uploaded.sort((a, b) => a.index - b.index).map((item) => item.photo);
        const finalPhotos = [...existing, ...orderedUploaded];
        // Persist the selected order after parallel uploads finish; API insert order can differ.
        try {
          await api.reorderPhotos(String(albumId), finalPhotos.map((p) => p.id));
        } catch {
          // Keep the local sequence visible; a refresh can retry if the order endpoint is unavailable.
        }
        qc.setQueryData(["album", albumId], (old: any) => old
          ? { ...old, album: { ...old.album, photos: finalPhotos } }
          : old);
      }
      await q.refetch();
      setLocalPreviews([]);
      if (failed > 0) {
        const failedLabel = failedNames.slice(0, 3).join(", ");
        setErr(failed === assets.length
          ? "All " + assets.length + " uploads failed: " + lastError + (failedLabel ? " (" + failedLabel + (failedNames.length > 3 ? ", …" : "") + ")" : "")
          : failed + " of " + assets.length + " photos failed" + (failedLabel ? ": " + failedLabel + (failedNames.length > 3 ? ", …" : "") : "") + ". Error: " + lastError + ". Please retry.");
      }
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setProgress(null);
      setLocalPreviews([]);
    }
  };

  const movePhoto = useCallback(async (photoId: string, delta: number) => {
    registerActivity();
    const current: any[] = q.data?.album?.photos || [];
    const from = current.findIndex((p) => p.id === photoId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= current.length) return;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
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

  const movePhotoTo = useCallback(async (photoId: string, targetPhotoId: string) => {
    registerActivity();
    if (photoId === targetPhotoId) return;
    const current: any[] = q.data?.album?.photos || [];
    const from = current.findIndex((p) => p.id === photoId);
    const to = current.findIndex((p) => p.id === targetPhotoId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    qc.setQueryData(["album", albumId], (old: any) => old ? { ...old, album: { ...old.album, photos: next } } : old);
    setSavingOrder(true);
    try {
      await api.reorderPhotos(String(albumId), next.map((p) => p.id));
    } catch (e: any) {
      setErr(e?.message || "Could not save photo order");
      await q.refetch();
    } finally {
      setSavingOrder(false);
      setDraggedPhotoId(null);
    }
  }, [albumId, q, qc, registerActivity]);

  const removePhoto = useCallback(async (pid: string) => {
    qc.setQueryData(["album", albumId], (old: any) => old ? { ...old, album: { ...old.album, photos: (old.album.photos || []).filter((p: any) => p.id !== pid) } } : old);
    await api.deletePhoto(String(albumId), pid);
    q.refetch();
  }, [albumId, q, qc]);

  const generate = async () => {
    registerActivity();
    if (photos.length === 0) { setErr("Please upload at least 1 photo"); return; }
    keepStyle
      ? router.replace({ pathname: "/create/generating", params: { albumId: String(albumId), style: String(keepStyle), coverPhotoId: String(photos[0]?.id || keepCover || "") } })
      : router.replace({ pathname: "/create/style", params: { albumId: String(albumId) } });
  };

  const uploading = !!progress;

  const renderItem = useCallback(({ item: p, index }: { item: any; index: number }) => {
    const completedPhoto = p.completedPhoto;
    const actual = completedPhoto || p;
    const ready = !!actual.id && !!actual.thumbnail_url && !p.pending;
    const localPreview = !!p.localPreview && !!p.localUri && !completedPhoto;
    const canReorder = ready && !uploading;
    const fileSize = Number(actual.size_bytes ?? actual.fileSize ?? 0);
    const needsReplacement = fileSize > 0 && fileSize < 100 * 1024;
    return (
      <View
        style={{ width: cell, height: cell, marginLeft: index % COLS === 0 ? 0 : GAP, marginBottom: GAP }}
        testID={ready ? `upload-photo-${actual.id}` : localPreview ? `upload-local-preview-${index}` : `upload-pending-${index}`}
        pointerEvents="auto"
        onTouchStart={registerActivity}
        {...({
          draggable: Platform.OS === "web" && ready && !uploading,
          onDragStart: (event: any) => {
            if (Platform.OS !== "web" || !ready || uploading) return;
            setDraggedPhotoId(actual.id);
            event?.dataTransfer?.setData?.("text/plain", actual.id);
            if (event?.dataTransfer) event.dataTransfer.effectAllowed = "move";
            registerActivity();
          },
          onDragOver: (event: any) => {
            if (Platform.OS === "web" && draggedPhotoId && draggedPhotoId !== actual.id) {
              event?.preventDefault?.();
              if (event?.dataTransfer) event.dataTransfer.dropEffect = "move";
            }
          },
          onDrop: (event: any) => {
            event?.preventDefault?.();
            const sourceId = event?.dataTransfer?.getData?.("text/plain") || draggedPhotoId;
            if (sourceId && ready && sourceId !== actual.id) void movePhotoTo(sourceId, actual.id);
            setDraggedPhotoId(null);
          },
          onDragEnd: () => setDraggedPhotoId(null),
          onPointerEnter: () => { registerActivity(); if (needsReplacement && actual.id) setHoveredQualityId(actual.id); },
          onPointerLeave: () => setHoveredQualityId(null),
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
        {index === 0 && ready ? (
          <View style={styles.coverBadge} pointerEvents="none">
            <Feather name="star" size={10} color="#FFF" />
            <Text style={styles.coverBadgeText}>COVER IMAGE</Text>
          </View>
        ) : null}
        {needsReplacement ? (
          <Animated.View style={[styles.qualityBadge, { opacity: qualityBlink }]} accessibilityLabel="Replace this image: file is smaller than 100 KB">
            <Feather name="alert-triangle" size={13} color="#FFF" />
          </Animated.View>
        ) : null}
        {needsReplacement && hoveredQualityId === actual.id ? (
          <View pointerEvents="none" style={styles.qualityTooltip}>
            <Text style={styles.qualityTooltipText}>Replace image — file is smaller than 100 KB</Text>
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
  }, [cell, draggedPhotoId, hoveredQualityId, movePhoto, movePhotoTo, photos.length, qualityBlink, registerActivity, removePhoto, uploading]);


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
  qualityBadge: { position: "absolute", top: 4, left: 4, width: 25, height: 25, borderRadius: 13, backgroundColor: "#D91E18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFF" },
  coverBadge: { position: "absolute", top: 4, left: 30, right: 30, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "rgba(28,25,23,0.82)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 4 },
  coverBadgeText: { color: "#FFF", fontSize: 8, fontWeight: "700", letterSpacing: 0.5 },
  qualityTooltip: { position: "absolute", top: 31, left: 3, right: 3, zIndex: 5, backgroundColor: "#B91C1C", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 3 },
  qualityTooltipText: { color: "#FFF", fontSize: 9, lineHeight: 11, fontWeight: "600", textAlign: "center" },
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
