import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { s, Button } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

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

        <View style={styles.section}>
          <Text style={s.label}>Order summary</Text>
          <View style={styles.summaryRow}><Text style={s.body}>Subtotal</Text><Text style={s.body}>₹{order?.price?.subtotal}</Text></View>
          {order?.price?.discount ? <View style={styles.summaryRow}><Text style={{ color: colors.success, fontFamily: fonts.text }}>Discount</Text><Text style={{ color: colors.success, fontFamily: fonts.text }}>−₹{order.price.discount}</Text></View> : null}
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
  section: { marginTop: spacing.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, marginTop: spacing.sm },
});
