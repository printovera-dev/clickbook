import { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { FluidImage } from "@/src/components/fluid-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, fileUrl } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

const PAGE = 10;

export default function ChooseCover() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // card = list padding (xl) each side + 1px card border each side; the artwork fills the card width at its own ratio
  const cardW = Math.min(width, 720) - spacing.xl * 2 - 2;
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Infinite scroll: covers arrive 10 at a time, so an admin catalog of any size stays light.
  const q = useInfiniteQuery({
    queryKey: ["covers"],
    queryFn: ({ pageParam }) => api.listCovers(pageParam, PAGE),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const covers = q.data?.pages.flatMap((p) => p.covers) || [];

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
      <FlatList
        testID="cover-list"
        data={covers}
        keyExtractor={(c) => c.id}
        extraData={selected}
        initialNumToRender={4}
        windowSize={5}
        removeClippedSubviews
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140, gap: spacing.lg, width: "100%", maxWidth: 720, alignSelf: "center" }}
        ListHeaderComponent={
          <View>
            <Text style={s.h1}>Choose a cover</Text>
            <Text style={[s.bodyMuted, { marginTop: spacing.sm, marginBottom: spacing.sm }]}>Every ClickBook comes as an 8 × 8 inch premium hardcover.</Text>
          </View>
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.md }} /> : null}
        renderItem={({ item: c }) => (
          <Pressable
            testID={`cover-${c.id}`}
            onPress={() => setSelected(c.id)}
            style={[styles.card, selected === c.id && styles.cardSelected]}
          >
            {/* Actual cover artwork shown complete & proportional (contain) — never stretched or cropped */}
            <FluidImage uri={fileUrl(c.image_url)} width={cardW} ratio={1} maxHeight={cardW} recyclingKey={c.id} style={styles.coverImg} testID={`cover-img-${c.id}`} />
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
        )}
      />
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
  coverImg: { alignSelf: "center", backgroundColor: colors.surfaceSecondary },
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
