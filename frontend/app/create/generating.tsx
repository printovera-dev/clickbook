import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, fonts } from "@/src/theme";

export default function Generating() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  useEffect(() => {
    (async () => {
      try {
        await api.autoGenerate(String(albumId));
        setTimeout(() => router.replace({ pathname: "/album/[id]/preview", params: { id: String(albumId) } }), 400);
      } catch (e) {
        router.back();
      }
    })();
  }, [albumId]);
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
});
