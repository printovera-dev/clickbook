import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, fonts } from "@/src/theme";

export default function Generating() {
  const { albumId, style, coverPhotoId } = useLocalSearchParams<{ albumId: string; style?: string; coverPhotoId?: string }>();
  const router = useRouter();
  const [err, setErr] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    (async () => {
      try {
        await api.autoGenerate(String(albumId), style ? String(style) : undefined, coverPhotoId ? String(coverPhotoId) : undefined);
        setTimeout(() => router.replace({ pathname: "/album/[id]/preview", params: { id: String(albumId) } }), 400);
      } catch (e: any) {
        if (e?.detail?.code === "insufficient_photos") {
          router.replace({ pathname: "/create/upload", params: { albumId: String(albumId), notice: e.detail.message, style: String(style || ""), coverPhotoId: String(coverPhotoId || "") } });
          return;
        }
        setErr(e?.message || "Could not design your album. Please try again.");
      }
    })();
  }, [albumId, retryKey]);
  if (err) {
    return (
      <View style={styles.wrap}>
        <Text style={[s.h2, { textAlign: "center" }]}>Couldn&apos;t design your album</Text>
        <Text style={[s.bodyMuted, { marginTop: spacing.sm, textAlign: "center" }]}>{err}</Text>
        <Pressable testID="generating-retry" onPress={() => { setErr(""); setRetryKey((k) => k + 1); }} style={styles.retryBtn}>
          <Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.text, fontWeight: "500" }}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg }} testID="generating-back">
          <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text }}>← Back to upload</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      <Text style={[s.h1, { marginTop: spacing.xl, textAlign: "center" }]}>Designing your album…</Text>
      <Text style={[s.bodyMuted, { marginTop: spacing.sm, textAlign: "center" }]}>
        Placing photos, choosing layouts, and preparing your 3D preview.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  retryBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 999 },
});
