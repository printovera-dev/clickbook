import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, useWindowDimensions } from "react-native";
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
  const [err, setErr] = useState("");

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
      const assets = res.assets;
      setProgress({ done: 0, total: assets.length });
      let failed = 0;
      let lastError = "";
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const name = asset.fileName || `photo_${Date.now()}_${i}.jpg`;
        try {
          // one file at a time: only a single upload body is ever held in memory
          const r = await api.uploadPhoto(String(albumId), asset.uri, name, (asset as any).file);
          qc.setQueryData(["album", albumId], (old: any) => old ? { ...old, album: { ...old.album, photos: [...(old.album.photos || []), r.photo] } } : old);
        } catch (e: any) {
          failed += 1;
          lastError = e?.message || "upload failed";
        }
        setProgress({ done: i + 1, total: assets.length });
      }
      await q.refetch();
      if (failed > 0) {
        setErr(failed === assets.length
          ? `Upload failed: ${lastError}`
          : `${failed} of ${assets.length} photos failed to upload. Please retry.`);
      }
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setProgress(null);
    }
  };

  const removePhoto = useCallback(async (pid: string) => {
    qc.setQueryData(["album", albumId], (old: any) => old ? { ...old, album: { ...old.album, photos: (old.album.photos || []).filter((p: any) => p.id !== pid) } } : old);
    await api.deletePhoto(String(albumId), pid);
    q.refetch();
  }, [albumId, q, qc]);

  const generate = async () => {
    if (photos.length === 0) { setErr("Please upload at least 1 photo"); return; }
    keepStyle
      ? router.replace({ pathname: "/create/generating", params: { albumId: String(albumId), style: String(keepStyle), coverPhotoId: String(keepCover || "") } })
      : router.replace({ pathname: "/create/style", params: { albumId: String(albumId) } });
  };

  const renderItem = useCallback(({ item: p, index }: { item: any; index: number }) => (
    <View style={{ width: cell, height: cell, marginLeft: index % COLS === 0 ? 0 : GAP, marginBottom: GAP }} testID={`upload-photo-${p.id}`}>
      <Thumb uri={p.thumbnail_url} recyclingKey={p.id} style={styles.thumb} />
      <Pressable style={styles.thumbRemove} onPress={() => removePhoto(p.id)} testID={`upload-remove-${p.id}`} hitSlop={6}>
        <Feather name="x" size={14} color="#FFF" />
      </Pressable>
    </View>
  ), [cell, removePhoto]);

  const uploading = !!progress;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="upload-back" hitSlop={12}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Step 2 of 3</Text>
        <View style={{ width: 22 }} />
      </View>
      <FlatList
        testID="upload-photo-grid"
        data={photos}
        keyExtractor={(p) => p.id}
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
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="upload-generate-button" label={`Design my album (${photos.length} photos)`} onPress={generate} disabled={photos.length === 0 || uploading} />
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
