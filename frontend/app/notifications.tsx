import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { s, timeAgo } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  offer: { icon: "tag", color: colors.brandPrimary, label: "Offer" },
  correction: { icon: "alert-circle", color: colors.warning, label: "Action needed" },
  status: { icon: "truck", color: colors.info, label: "Order update" },
  order: { icon: "check-circle", color: colors.success, label: "Order" },
  general: { icon: "bell", color: colors.muted, label: "Update" },
};

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.listNotifications() });
  const items = q.data?.notifications || [];
  const unread = q.data?.unread_count || 0;

  const open = async (n: any) => {
    if (!n.read) {
      await api.readNotification(n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.order_id) router.push({ pathname: "/order/[id]", params: { id: n.order_id } });
  };
  const readAll = async () => {
    await api.readAllNotifications();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="notifications-back" hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.h2}>Notifications</Text>
        {unread > 0 ? (
          <Pressable onPress={readAll} testID="notifications-read-all" hitSlop={12}>
            <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 13 }}>Mark all read</Text>
          </Pressable>
        ) : <View style={{ width: 22 }} />}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="bell-off" size={40} color={colors.muted} />
            <Text style={[s.h2, { marginTop: spacing.md }]}>You&apos;re all caught up</Text>
            <Text style={[s.bodyMuted, { textAlign: "center", marginTop: spacing.xs }]}>Order updates, offers and messages from the ClickBook team will appear here.</Text>
          </View>
        ) : items.map((n: any) => {
          const meta = TYPE_META[n.type] || TYPE_META.general;
          return (
            <Pressable key={n.id} testID={`notification-${n.id}`} onPress={() => open(n)} style={[styles.card, !n.read && styles.cardUnread]}>
              <View style={[styles.iconWrap, { backgroundColor: meta.color + "22" }]}>
                <Feather name={meta.icon as any} size={18} color={meta.color} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={[s.label, { color: meta.color }]}>{meta.label}</Text>
                  <Text style={[s.bodyMuted, { fontSize: 12 }]}>{timeAgo(n.created_at)}</Text>
                </View>
                <Text style={[s.body, { fontWeight: n.read ? "400" : "600", marginTop: 2 }]}>{n.title}</Text>
                <Text style={[s.bodyMuted, { marginTop: 2 }]}>{n.body}</Text>
                {n.order_id ? <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 13, marginTop: spacing.sm }}>View order →</Text> : null}
              </View>
              {!n.read ? <View style={styles.dot} testID={`notification-unread-${n.id}`} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  card: { flexDirection: "row", alignItems: "flex-start", padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  cardUnread: { borderColor: colors.brandSecondary, backgroundColor: colors.surface },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary, marginLeft: spacing.sm, marginTop: 6 },
  empty: { alignItems: "center", padding: spacing.xxxl },
});
