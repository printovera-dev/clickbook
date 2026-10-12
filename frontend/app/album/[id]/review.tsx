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
  const isWedding = !!album?.album_config;
  const photos: any[] = album?.photos || [];
  const photoIds = new Set(photos.map((p: any) => p.id));
  const missingSlots = (album?.pages || []).reduce((total: number, page: any) => total + (page.photo_ids || []).filter((pid: string) => !photoIds.has(pid)).length, 0);
  const lowResolution = photos.filter((p: any) => {
    const w = Number(p.width || p.width_px || 0);
    const h = Number(p.height || p.height_px || 0);
    return w > 0 && h > 0 && Math.min(w, h) < 1200;
  }).length;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="review-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Final review</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 }}>
        <Text style={s.h1}>{isWedding ? "Review your wedding album" : "Review your ClickBook"}</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Flip through every page and check the artwork before ordering.</Text>
        {isWedding ? (
          <View style={styles.specCard} testID="wedding-review-specs">
            <Text style={s.label}>PRINT SETTINGS</Text>
            <Text style={[s.body, { marginTop: spacing.sm }]}>{String(album.size || "12x18").replace("x", " × ")} inch · {album.paper_finish === "matte" ? "Matte" : "Gloss"} paper · {album.cover_material === "acrylic" ? "Acrylic" : "Digital"} cover</Text>
            <Text style={[s.bodyMuted, { marginTop: 4 }]}>{photos.length} uploaded photos · {(album.pages || []).length} designed pages</Text>
          </View>
        ) : null}
        {isWedding && (missingSlots > 0 || lowResolution > 0) ? (
          <View style={styles.warningCard} testID="wedding-review-warnings">
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Feather name="alert-triangle" size={18} color={colors.error} />
              <Text style={[s.h2, { color: colors.error }]}>Please check before ordering</Text>
            </View>
            {missingSlots > 0 ? <Text style={[s.body, { marginTop: spacing.sm }]}>{missingSlots} photo slot(s) refer to missing images. Open the editor to correct them.</Text> : null}
            {lowResolution > 0 ? <Text style={[s.body, { marginTop: spacing.sm }]}>{lowResolution} photo(s) have a small source dimension and may look soft in a large print.</Text> : null}
          </View>
        ) : null}
        {isWedding && missingSlots === 0 && lowResolution === 0 ? (
          <View style={styles.okCard} testID="wedding-review-no-known-warnings">
            <Feather name="check-circle" size={17} color={colors.brandPrimary} />
            <Text style={[s.body, { flex: 1 }]}>No missing photo references or obvious small-image warnings were detected. Please still inspect each spread carefully.</Text>
          </View>
        ) : null}
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
  specCard: { marginTop: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  warningCard: { marginTop: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  okCard: { marginTop: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  confirmRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
