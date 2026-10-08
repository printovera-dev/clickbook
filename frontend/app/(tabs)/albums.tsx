import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { Thumb } from "@/src/components/thumb";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function Albums() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["albums"], queryFn: () => api.listMyAlbums() });
  const all: any[] = q.data?.albums || [];
  // Only albums whose design exists are "ClickBooks"; interrupted creations (crash / failed upload) are listed
  // separately as "Continue" cards instead of pretending to be finished albums.
  const albums = [...all.filter((a) => a.is_complete), ...all.filter((a) => !a.is_complete)];
  const label = (a: any) => a.state === "locked" ? "ordered · view only" : a.state === "delivered" ? "delivered" : a.state === "draft" ? "draft" : a.state === "uploading" ? "incomplete · continue uploading" : "incomplete · continue";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[s.h1]}>My ClickBooks</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Drafts and ordered albums</Text>
      </View>
      <FlatList
        data={albums}
        keyExtractor={(a: any) => a.id}
        initialNumToRender={8}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="book-open" size={44} color={colors.muted} />
            <Text style={[s.h2, { marginTop: spacing.md }]}>No albums yet</Text>
            <Text style={[s.bodyMuted, { marginTop: 4, textAlign: "center" }]}>
              Tap &ldquo;Create your ClickBook&rdquo; on Home to start.
            </Text>
          </View>
        }
        renderItem={({ item: a }: { item: any }) => (
          <Pressable
            testID={`album-card-${a.id}`}
            style={styles.card}
            onPress={() =>
              !a.is_complete
                ? router.push({ pathname: "/create/upload", params: { albumId: a.id } })
                : a.state === "draft"
                  ? router.push({ pathname: "/album/[id]/editor", params: { id: a.id } })
                  : router.push({ pathname: "/album/[id]/preview", params: { id: a.id } })
            }
          >
            <Thumb uri={a.cover_thumbnail_url} recyclingKey={a.id} style={[styles.thumb, !a.is_complete && { opacity: 0.6 }]} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={s.h2} numberOfLines={1}>{a.name}</Text>
              <Text style={s.bodyMuted}>{a.photos?.length || 0} photos · {a.sheets || 0} sheets</Text>
              <View style={styles.badge}>
                <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  {label(a)}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" color={colors.muted} size={22} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.xl, borderBottomColor: colors.border, borderBottomWidth: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.md,
  },
  thumb: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  badge: {
    marginTop: spacing.xs,
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  empty: { alignItems: "center", padding: spacing.xxxl },
});
