import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function ChooseCover() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["covers"], queryFn: () => api.listCovers() });

  const next = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api.createAlbum(selected);
      router.replace({ pathname: "/create/upload", params: { albumId: r.album.id } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="cover-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Step 1 of 3</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}>
        <Text style={s.h1}>Choose a cover</Text>
        <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Every ClickBook comes as an 8 × 8 inch premium hardcover.</Text>
        <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
          {(q.data?.covers || []).map((c: any) => (
            <Pressable
              key={c.id}
              testID={`cover-${c.id}`}
              onPress={() => setSelected(c.id)}
              style={[styles.card, selected === c.id && styles.cardSelected]}
            >
              <Image source={{ uri: c.image_url }} style={styles.coverImg} contentFit="cover" />
              <View style={{ padding: spacing.lg }}>
                <Text style={s.h2}>{c.name}</Text>
                <Text style={s.bodyMuted}>{c.description}</Text>
                {selected === c.id && (
                  <View style={styles.selectedBadge}>
                    <Feather name="check" size={14} color={colors.onBrandPrimary} />
                    <Text style={{ color: colors.onBrandPrimary, marginLeft: 4, fontFamily: fonts.text }}>Selected</Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="cover-continue" label="Continue" onPress={next} disabled={!selected} loading={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  cardSelected: { borderColor: colors.brandPrimary, borderWidth: 2 },
  coverImg: { width: "100%", height: 180, backgroundColor: colors.surfaceTertiary },
  selectedBadge: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  footer: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
