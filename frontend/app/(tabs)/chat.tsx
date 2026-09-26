// Chat tab: WhatsApp support with the customer's order number pre-filled. One order → opens WhatsApp directly;
// several orders → pick which order to discuss. Also links to in-app messages from the ClickBook team.
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { StatusBadge } from "@/src/components/status-badge";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

export function whatsappUrl(number: string, message: string) {
  const digits = number.replace(/\D/g, "");
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

export default function Chat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api.listMyOrders() });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });
  const notifs = useQuery({ queryKey: ["notifications"], queryFn: () => api.listNotifications() });
  const [autoOpened, setAutoOpened] = useState(false);
  const number = settings.data?.settings?.support_whatsapp || "9999117810";
  const list = orders.data?.orders || [];

  const open = (orderNo?: string) => {
    const msg = orderNo ? `Hello ClickBook, I have a question regarding Order #${orderNo}.` : "Hello ClickBook, I have a question about making my ClickBook.";
    Linking.openURL(whatsappUrl(number, msg));
  };

  // Exactly one order → go straight to WhatsApp with that order number (no selection step).
  useEffect(() => {
    if (!autoOpened && orders.isSuccess && settings.isSuccess && list.length === 1) { setAutoOpened(true); open(list[0].order_no); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.isSuccess, settings.isSuccess, list.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={s.h1}>Chat</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Talk to the ClickBook team on WhatsApp</Text>
      </View>
      <FlatList
        data={list}
        keyExtractor={(o: any) => o.id}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}
        ListHeaderComponent={
          <View>
            <Pressable testID="chat-messages" onPress={() => router.push("/notifications")} style={styles.card}>
              <Feather name="inbox" size={22} color={colors.homeBlue} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.title}>Messages from ClickBook</Text>
                <Text style={s.bodyMuted}>{notifs.data?.unread_count ? `${notifs.data.unread_count} unread` : "Order updates, offers & corrections"}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
            {orders.isLoading ? <ActivityIndicator color={colors.homeMint} style={{ marginTop: spacing.xl }} /> : null}
            {list.length === 0 && orders.isSuccess ? (
              <Pressable testID="chat-whatsapp-general" onPress={() => open()} style={[styles.card, styles.wa]}>
                <Feather name="message-circle" size={22} color="#FFF" />
                <Text style={[styles.title, { color: "#FFF", marginLeft: spacing.md }]}>Chat on WhatsApp</Text>
              </Pressable>
            ) : null}
            {list.length === 1 ? (
              <Pressable testID="chat-whatsapp-single" onPress={() => open(list[0].order_no)} style={[styles.card, styles.wa]}>
                <Feather name="message-circle" size={22} color="#FFF" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[styles.title, { color: "#FFF" }]}>Chat about Order #{list[0].order_no}</Text>
                  <Text style={{ color: "#FFF", opacity: 0.9, fontFamily: fonts.text, fontSize: 13 }}>Opens WhatsApp with your order number</Text>
                </View>
              </Pressable>
            ) : null}
            {list.length > 1 ? <Text style={[s.label, { marginTop: spacing.xl, marginBottom: spacing.md }]} testID="chat-pick-order">Which order is this about?</Text> : null}
          </View>
        }
        renderItem={list.length > 1 ? ({ item: o }: { item: any }) => (
          <Pressable testID={`chat-order-${o.id}`} onPress={() => open(o.order_no)} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Order #{o.order_no}</Text>
              <Text style={s.bodyMuted}>{new Date(o.created_at).toLocaleDateString()} · {o.sheets} sheets · ₹{o.price?.total}</Text>
              <StatusBadge order={o} />
            </View>
            <Feather name="message-circle" size={22} color={colors.homeMint} />
          </Pressable>
        ) : () => null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.xl, borderBottomColor: colors.border, borderBottomWidth: 1 },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md, minHeight: 64 },
  wa: { backgroundColor: colors.homeMint, borderColor: colors.homeMint },
  title: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: colors.onSurface },
});
