import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { Image } from "expo-image";
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
  const albums = q.data?.albums || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[s.h1]}>My ClickBooks</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Drafts and ordered albums</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {albums.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="book-open" size={44} color={colors.muted} />
            <Text style={[s.h2, { marginTop: spacing.md }]}>No albums yet</Text>
            <Text style={[s.bodyMuted, { marginTop: 4, textAlign: "center" }]}>
              Tap "Create your ClickBook" on Home to start.
            </Text>
          </View>
        ) : (
          albums.map((a: any) => (
            <Pressable
              key={a.id}
              testID={`album-card-${a.id}`}
              style={styles.card}
              onPress={() =>
                a.status === "draft"
                  ? router.push({ pathname: "/album/[id]/editor", params: { id: a.id } })
                  : router.push({ pathname: "/album/[id]/preview", params: { id: a.id } })
              }
            >
              <Image source={{ uri: a.cover_snapshot?.image_url }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={s.h2} numberOfLines={1}>{a.name}</Text>
                <Text style={s.bodyMuted}>{a.photos?.length || 0} photos · {a.sheets || 0} sheets</Text>
                <View style={styles.badge}>
                  <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {a.status}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" color={colors.muted} size={22} />
            </Pressable>
          ))
        )}
      </ScrollView>
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
