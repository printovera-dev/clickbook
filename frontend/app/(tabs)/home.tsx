import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { api, fileUrl } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const albums = useQuery({ queryKey: ["albums"], queryFn: () => api.listMyAlbums() });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api.listMyOrders() });
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => api.listOffers() });

  const drafts = (albums.data?.albums || []).filter((a: any) => a.status === "draft");
  const activeOrder = (orders.data?.orders || []).find((o: any) =>
    ["processing", "printing", "packaging", "out_for_delivery"].includes(o.production_status),
  );

  const refresh = () => {
    albums.refetch(); orders.refetch(); offers.refetch();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={albums.isFetching} onRefresh={refresh} tintColor={colors.brandPrimary} />}
    >
      <View style={styles.header}>
        <Text style={[s.display, { fontSize: 28 }]}>ClickBook</Text>
        <Pressable onPress={() => router.push("/(tabs)/profile")} testID="home-profile-icon">
          <Feather name="user" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <Pressable
        testID="home-create-hero"
        style={styles.heroCard}
        onPress={() => router.push("/create/cover")}
      >
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1646645732912-380a54b73484?crop=entropy&cs=srgb&fm=jpg&w=1200&q=85" }}
          style={{ position: "absolute", inset: 0 as any, width: "100%", height: "100%" }}
          contentFit="cover"
        />
        <LinearGradient colors={["transparent", "rgba(28,25,23,0.75)"]} style={{ position: "absolute", inset: 0 as any }} />
        <View style={{ padding: spacing.xl, marginTop: "auto" }}>
          <Text style={{ color: "#FFF", fontFamily: fonts.text, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Start today
          </Text>
          <Text style={{ color: "#FFF", fontFamily: fonts.display, fontSize: 26, marginTop: spacing.xs }}>
            Create your ClickBook
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: fonts.text, marginTop: spacing.sm }}>
            60-second album from your phone.
          </Text>
          <View style={{ marginTop: spacing.lg, flexDirection: "row" }}>
            <View style={{ backgroundColor: colors.brandPrimary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.pill }}>
              <Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.text, fontWeight: "500" }}>Upload Photos to Begin</Text>
            </View>
          </View>
        </View>
      </Pressable>

      {activeOrder ? (
        <View style={styles.section}>
          <Text style={s.label}>Current order</Text>
          <Pressable
            testID="home-active-order"
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: activeOrder.id } })}
            style={styles.orderCard}
          >
            <Feather name="package" size={22} color={colors.brandPrimary} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={s.h2}>{activeOrder.order_no}</Text>
              <Text style={s.bodyMuted}>{prettyStatus(activeOrder.production_status)} · {activeOrder.sheets} sheets</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={s.label}>Your drafts</Text>
          <Pressable onPress={() => router.push("/(tabs)/albums")} testID="home-see-all-albums">
            <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text }}>See all</Text>
          </Pressable>
        </View>
        {drafts.length === 0 ? (
          <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>No drafts yet. Your works-in-progress will show up here.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}>
            {drafts.slice(0, 6).map((a: any) => (
              <Pressable
                key={a.id}
                testID={`home-draft-${a.id}`}
                style={styles.draftCard}
                onPress={() => router.push({ pathname: a.pages?.length ? "/album/[id]/preview" : "/album/[id]/editor", params: { id: a.id } })}
              >
                <Image
                  source={{ uri: a.cover_snapshot?.image_url }}
                  style={{ width: "100%", height: 140 }}
                  contentFit="cover"
                />
                <View style={{ padding: spacing.md }}>
                  <Text style={s.h2} numberOfLines={1}>{a.name}</Text>
                  <Text style={s.bodyMuted}>{a.photos?.length || 0} photos</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {offers.data?.offers?.length ? (
        <View style={styles.section}>
          <Text style={s.label}>Offers</Text>
          {offers.data.offers.map((o: any) => (
            <View key={o.id} style={styles.offerCard} testID={`home-offer-${o.code}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{o.name}</Text>
                <Text style={s.bodyMuted}>
                  {o.discount_type === "percentage" ? `${o.value}% off` : `₹${o.value} off`}
                  {o.min_order ? ` · min ₹${o.min_order}` : ""}
                </Text>
              </View>
              <View style={styles.couponPill}>
                <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontWeight: "500", letterSpacing: 1 }}>{o.code}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.lg,
  },
  heroCard: {
    marginHorizontal: spacing.xl,
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
  },
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xxl },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  draftCard: {
    width: 220,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  offerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  couponPill: {
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    borderStyle: "dashed" as any,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
});
