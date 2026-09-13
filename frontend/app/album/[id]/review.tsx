import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { BookPreview } from "@/src/components/book-preview";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function Review() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const q = useQuery({ queryKey: ["album", id], queryFn: () => api.getAlbum(String(id)), enabled: !!id });
  const album = q.data?.album;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="review-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Final review</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 }}>
        <Text style={s.h1}>Review your ClickBook</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Flip through every page. Once ordered, we&#39;ll print exactly what you see.</Text>
        <View style={{ marginTop: spacing.xl, alignItems: "center" }}>
          {album ? <BookPreview cover={album.cover_snapshot} coverDesign={album.cover_design} pages={album.pages || []} photos={album.photos || []} albumName={album.name} onEditPage={(i) => router.push({ pathname: "/album/[id]/page", params: { id: String(id), index: String(i) } })} onEditCover={() => router.push({ pathname: "/album/[id]/page", params: { id: String(id), index: "cover" } })} /> : null}
        </View>
        <Pressable testID="review-confirm-check" onPress={() => setConfirmed(!confirmed)} style={styles.confirmRow}>
          <View style={[styles.checkbox, confirmed && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
            {confirmed && <Feather name="check" size={14} color="#FFF" />}
          </View>
          <Text style={[s.body, { marginLeft: spacing.md, flex: 1 }]}>I have reviewed my ClickBook and want to place the order.</Text>
        </Pressable>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Button testID="review-edit-button" label="Edit" variant="outline" onPress={() => router.push({ pathname: "/album/[id]/editor", params: { id: String(id) } })} style={{ flex: 1 }} />
          <Button testID="review-continue-button" label="Continue to Order" onPress={() => router.push({ pathname: "/album/[id]/checkout", params: { id: String(id) } })} disabled={!confirmed} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  confirmRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
