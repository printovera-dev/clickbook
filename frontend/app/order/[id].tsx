import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge, orderStatus } from "@/src/components/status-badge";
import { api } from "@/src/api";
import { s, Button } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";
import { Image } from "expo-image";

const STAGES = ["processing", "printing", "packaging", "out_for_delivery", "delivered"];

export default function OrderTracking() {
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api.getOrder(String(id)), enabled: !!id, refetchInterval: 5000 });
  const order = q.data?.order;
  const bots = q.data?.process_bots || [];
  const currentIdx = order ? STAGES.indexOf(order.production_status) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.replace("/(tabs)/orders")} testID="order-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Order tracking</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        {order ? (
          <View testID="payment-status-card" style={[styles.celebrate, { borderColor: orderStatus(order).color, backgroundColor: orderStatus(order).bg }]}>
            <Feather name={orderStatus(order).paid ? "check-circle" : "alert-circle"} size={22} color={orderStatus(order).color} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={s.h2}>{orderStatus(order).paid ? "Payment complete" : "Payment incomplete"}</Text>
              <Text style={s.bodyMuted}>
                {orderStatus(order).paid
                  ? `Paid ${order.paid_at ? new Date(order.paid_at).toLocaleString() : ""} · ${order.payment_method === "razorpay" ? "Razorpay" : "verified"} · ₹${order.price?.total}`
                  : "Your ClickBook will go to print once payment is confirmed."}
              </Text>
              <StatusBadge order={order} testID="order-tracking-status" />
              {!orderStatus(order).paid ? (
                <Pressable testID="complete-payment-button" onPress={() => router.push({ pathname: "/album/[id]/checkout", params: { id: String(order.album_id) } })} style={{ marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: colors.error, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 }}>
                  <Text style={{ color: colors.onError, fontFamily: fonts.text, fontWeight: "600" }}>Complete payment</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        {celebrate === "1" ? (
          <View style={styles.celebrate} testID="order-celebrate-banner">
            <Feather name="check-circle" size={22} color={colors.success} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={s.h2}>Order placed!</Text>
              <Text style={s.bodyMuted}>Payment successful. We'll start printing shortly.</Text>
            </View>
          </View>
        ) : null}
        <Text style={s.h1}>{order?.order_no}</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>
          ₹{order?.price?.total} · {order?.sheets} sheets · {order?.created_at ? new Date(order.created_at).toLocaleDateString() : ""}
        </Text>

        <View style={{ marginTop: spacing.xxl }}>
          <Text style={s.label}>Production status</Text>
          <View style={{ marginTop: spacing.md }}>
            {STAGES.map((stage, i) => {
              const active = i === currentIdx;
              const done = i < currentIdx;
              const bot = bots.find((b: any) => b.stage === stage);
              const iconName = (bot?.icon || "circle") as any;
              return (
                <View key={stage} style={styles.stageRow} testID={`stage-${stage}`}>
                  <View style={styles.stageLeft}>
                    <View style={[styles.node, done ? styles.nodeDone : active ? styles.nodeActive : styles.nodeInactive]}>
                      <Feather name={done ? "check" : iconName} size={14} color={done || active ? "#FFF" : colors.muted} />
                    </View>
                    {i < STAGES.length - 1 && <View style={[styles.rail, (done || active) && { backgroundColor: colors.brandPrimary }]} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.xl }}>
                    <Text style={[s.h2, !active && !done && { color: colors.muted }]}>{bot?.label || stage.replace(/_/g, " ")}</Text>
                    {active && bot?.message ? (
                      <View style={styles.botBubble}>
                        {bot.image_url ? <Image source={{ uri: bot.image_url }} style={{ width: "100%", height: 120, borderRadius: 6, marginBottom: 8 }} contentFit="cover" /> : null}
                        <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.text }}>{bot.message}</Text>
                      </View>
                    ) : null}
                    {done ? <Text style={[s.bodyMuted, { marginTop: 2 }]}>Completed</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={s.label}>Delivery address</Text>
          <Text style={[s.body, { marginTop: spacing.sm }]}>{order?.address?.name}</Text>
          <Text style={s.bodyMuted}>{order?.address?.line1}, {order?.address?.city}, {order?.address?.state} {order?.address?.pin}</Text>
          {order?.tracking_number ? <Text style={[s.body, { marginTop: spacing.sm }]}>Tracking: {order.tracking_number}</Text> : null}
        </View>

        {order?.gift_wrap ? (
          <View style={styles.giftCardPreview} testID="order-gift-note-preview">
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Feather name="gift" size={18} color={colors.onBrandTertiary} />
              <Text style={{ marginLeft: 8, fontFamily: fonts.text, fontSize: 12, color: colors.onBrandTertiary, textTransform: "uppercase", letterSpacing: 0.6 }}>Gift wrapped</Text>
            </View>
            {order?.gift_note ? (
              <Text style={styles.giftCardNote}>&ldquo;{order.gift_note}&rdquo;</Text>
            ) : (
              <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>No note added.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={s.label}>Order summary</Text>
          <View style={styles.summaryRow}><Text style={s.body}>Subtotal</Text><Text style={s.body}>₹{order?.price?.subtotal}</Text></View>
          {order?.price?.discount ? <View style={styles.summaryRow}><Text style={{ color: colors.success, fontFamily: fonts.text }}>Discount</Text><Text style={{ color: colors.success, fontFamily: fonts.text }}>−₹{order.price.discount}</Text></View> : null}
          {order?.gift_wrap ? <View style={styles.summaryRow}><Text style={s.body}>Gift wrap</Text><Text style={s.body}>₹{order?.price?.gift_wrap_fee}</Text></View> : null}
          <View style={styles.summaryRow}><Text style={s.body}>GST</Text><Text style={s.body}>₹{order?.price?.gst}</Text></View>
          <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm }]}>
            <Text style={s.h2}>Total paid</Text>
            <Text style={s.h2}>₹{order?.price?.total}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  celebrate: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#E8F1EA", marginBottom: spacing.xl },
  stageRow: { flexDirection: "row" },
  stageLeft: { alignItems: "center", width: 40 },
  node: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  nodeDone: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  nodeActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  nodeInactive: { backgroundColor: colors.surface },
  rail: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  botBubble: { marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md },
  giftCardPreview: { marginTop: spacing.xxl, padding: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandSecondary },
  giftCardNote: { marginTop: spacing.sm, fontFamily: fonts.display, fontSize: 16, color: colors.onBrandTertiary, fontStyle: "italic", lineHeight: 22 },
  section: { marginTop: spacing.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: spacing.sm },
});
