// Production board: paid orders grouped by production stage with one-tap "advance to next stage".
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api, fileUrl } from "@/src/api";
import { AdminPage, LinkChip, fmtDate, useWide } from "@/src/components/admin-page";
import { s } from "@/src/ui";
import { colors, fonts, radius, spacing } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

const STAGES = ["processing", "printing", "packaging", "out_for_delivery", "delivered"];

export default function AdminProduction() {
  const q = useQuery({ queryKey: ["admin-orders", "production"], queryFn: () => api.adminOrders() });
  const wide = useWide(1100);
  const orders = (q.data?.orders || []).filter((o: any) => o.payment_status === "paid");
  const advance = async (o: any) => {
    const i = STAGES.indexOf(o.production_status);
    if (i < 0 || i >= STAGES.length - 1) return;
    await api.adminUpdateOrderStatus(o.id, { production_status: STAGES[i + 1], note: "" });
    q.refetch();
  };
  return (
    <AdminPage title="Production" testID="admin-production" refreshing={q.isFetching} onRefresh={q.refetch}>
      <Text style={s.bodyMuted}>{orders.length} paid order{orders.length === 1 ? "" : "s"} in the pipeline. Tap → to move an order to the next stage; the customer is notified automatically.</Text>
      <View style={[styles.board, wide && { flexDirection: "row", alignItems: "flex-start" }]}>
        {STAGES.map((st) => {
          const list = orders.filter((o: any) => o.production_status === st);
          return (
            <View key={st} style={[styles.col, wide && { flex: 1 }]} testID={`prod-col-${st}`}>
              <View style={styles.colHead}>
                <Text style={styles.colTitle}>{st.replace(/_/g, " ")}</Text>
                <View style={styles.count}><Text style={styles.countTxt}>{list.length}</Text></View>
              </View>
              {list.length === 0 ? <Text style={[s.bodyMuted, { fontSize: 12 }]}>—</Text> : null}
              {list.map((o: any) => (
                <View key={o.id} style={styles.card} testID={`prod-card-${o.id}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={styles.orderNo}>{o.order_no}</Text>
                    {st !== "delivered" ? (
                      <Pressable onPress={() => advance(o)} hitSlop={8} style={styles.next} testID={`prod-advance-${o.id}`}><Feather name="arrow-right" size={16} color={colors.onBrandPrimary} /></Pressable>
                    ) : <Feather name="check-circle" size={18} color="#1F7A44" />}
                  </View>
                  <Text style={s.bodyMuted}>{o.client_name || o.customer_snapshot?.name || "—"} · {o.sheets} sheets</Text>
                  <Text style={[s.bodyMuted, { fontSize: 12 }]}>Paid {fmtDate(o.paid_at)}{o.gift_wrap ? " · 🎁" : ""}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    <LinkChip icon="file-text" label="PDF" disabled={!o.production_package?.pdf_url} onPress={() => Linking.openURL(fileUrl(o.production_package?.pdf_url)!)} />
                    <LinkChip icon="layers" label="Print" disabled={!o.production_package?.print_urls?.[0]} onPress={() => Linking.openURL(fileUrl(o.production_package?.print_urls?.[0])!)} />
                    <LinkChip icon="image" label="Cover" disabled={!o.production_package?.cover_url} onPress={() => Linking.openURL(fileUrl(o.production_package?.cover_url)!)} />
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  board: { gap: spacing.md, marginTop: spacing.lg },
  col: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  colHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  colTitle: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: colors.onSurface, fontWeight: "700" },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  countTxt: { color: colors.onBrandPrimary, fontFamily: fonts.text, fontSize: 11, fontWeight: "700" },
  card: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, gap: 2 },
  orderNo: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: colors.onSurface },
  next: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
