import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { BookPreview } from "@/src/components/book-preview";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AlbumPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["album", id], queryFn: () => api.getAlbum(String(id)), enabled: !!id });
  const album = q.data?.album;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.replace("/(tabs)/home")} testID="preview-close"><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>3D Preview</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}>
        <Text style={s.h1}>{album?.name}</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Drag a page from its edge, or use the arrows, to turn the pages of your book.</Text>
        <View style={{ marginTop: spacing.xl, alignItems: "center" }}>
          {album ? (
            <BookPreview
              cover={album.cover_snapshot}
              pages={album.pages || []}
              photos={album.photos || []}
              albumName={album.name}
            />
          ) : null}
        </View>
        <View style={styles.stats}>
          <Stat label="Pages" value={String(album?.pages?.length || 0)} />
          <Stat label="Sheets" value={String(album?.sheets || 0)} />
          <Stat label="Size" value="8×8″" />
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Button testID="preview-edit-button" label="Edit" variant="outline" onPress={() => router.push({ pathname: "/album/[id]/editor", params: { id: String(id) } })} style={{ flex: 1 }} />
          <Button testID="preview-continue-button" label="Continue" onPress={() => router.push({ pathname: "/album/[id]/review", params: { id: String(id) } })} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.h2, { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  stats: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xxl },
  stat: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
