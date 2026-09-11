import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["orders"], queryFn: () => api.listMyOrders() });
  const orders = q.data?.orders || [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={s.h1}>Orders</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={44} color={colors.muted} />
            <Text style={[s.h2, { marginTop: spacing.md }]}>No orders yet</Text>
          </View>
        ) : (
          orders.map((o: any) => (
            <Pressable
              key={o.id}
              testID={`order-card-${o.id}`}
              style={styles.card}
              onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.id } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>{o.order_no}</Text>
                <Text style={s.bodyMuted}>
                  {new Date(o.created_at).toLocaleDateString()} · {o.sheets} sheets · ₹{o.price?.total}
                </Text>
                <View style={styles.badge}>
                  <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {o.production_status?.replace(/_/g, " ")}
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
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  empty: { alignItems: "center", padding: spacing.xxxl },
});
