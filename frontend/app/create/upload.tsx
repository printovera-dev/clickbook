import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function UploadStep() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const q = useQuery({ queryKey: ["album", albumId], queryFn: () => api.getAlbum(String(albumId)), enabled: !!albumId });
  const photos = q.data?.album?.photos || [];

  const pickAndUpload = async () => {
    setErr("");
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setErr("Photo permission required"); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.85,
        selectionLimit: 30,
      });
      if (res.canceled) return;
      setUploading(true);
      let failed = 0;
      let lastError = "";
      for (const asset of res.assets) {
        const name = asset.fileName || `photo_${Date.now()}.jpg`;
        try {
          await api.uploadPhoto(String(albumId), asset.uri, name, (asset as any).file);
        } catch (e: any) {
          failed += 1;
          lastError = e?.message || "upload failed";
          console.warn("upload failed", e);
        }
      }
      await q.refetch();
      if (failed > 0) {
        setErr(failed === res.assets.length
          ? `Upload failed: ${lastError}`
          : `${failed} of ${res.assets.length} photos failed to upload. Please retry.`);
      }
    } catch (e: any) {
      setErr(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (pid: string) => {
    await api.deletePhoto(String(albumId), pid);
    q.refetch();
  };

  const generate = async () => {
    if (photos.length === 0) { setErr("Please upload at least 1 photo"); return; }
    router.replace({ pathname: "/create/generating", params: { albumId: String(albumId) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="upload-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Step 2 of 3</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}>
        <Text style={s.h1}>Upload your photos</Text>
        <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Pick from your gallery. We&apos;ll design the album automatically.</Text>

        <Pressable testID="upload-pick-button" onPress={pickAndUpload} style={styles.dropzone}>
          {uploading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : (
            <>
              <Feather name="upload-cloud" size={40} color={colors.brandPrimary} />
              <Text style={[s.h2, { marginTop: spacing.sm }]}>Add photos</Text>
              <Text style={[s.bodyMuted, { marginTop: 4 }]}>Tap to select from gallery</Text>
            </>
          )}
        </Pressable>

        {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text> : null}

        {photos.length > 0 && (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xl }}>
              <Text style={s.label}>{photos.length} photos</Text>
            </View>
            <View style={styles.grid}>
              {photos.map((p: any) => (
                <View key={p.id} style={styles.thumbWrap} testID={`upload-photo-${p.id}`}>
                  <Image source={{ uri: p.thumbnail_url }} style={styles.thumb} contentFit="cover" />
                  <Pressable style={styles.thumbRemove} onPress={() => removePhoto(p.id)} testID={`upload-remove-${p.id}`}>
                    <Feather name="x" size={14} color="#FFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="upload-generate-button" label={`Design my album (${photos.length} photos)`} onPress={generate} disabled={photos.length === 0} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  thumbWrap: { width: "31%", aspectRatio: 1, position: "relative" },
  thumb: { width: "100%", height: "100%", borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  thumbRemove: {
    position: "absolute", top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(28,25,23,0.7)", alignItems: "center", justifyContent: "center",
  },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
});
