// Admin dashboard: KPIs, 14-day revenue/volume chart, status breakdown and (on phones) the full admin menu.
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api, setAdminToken } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";
import { ADMIN_NAV, Kpi, fmtMoney, fmtDate, useWide, Badge } from "@/src/components/admin-page";

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wide = useWide(960);
  const q = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api.adminDashboard(), retry: false });
  const d = q.data;

  if (q.error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, padding: spacing.xl, paddingTop: insets.top + spacing.xxl, alignItems: "center" }}>
        <Text style={s.h2}>Session expired</Text>
        <Pressable onPress={async () => { await setAdminToken(null); router.replace("/admin/login"); }} style={{ marginTop: spacing.lg, minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.brandPrimary }}>Sign in again</Text></Pressable>
      </View>
    );
  }

  const logout = async () => { await setAdminToken(null); router.replace("/admin/login"); };
  const daily: { date: string; revenue: number; orders: number }[] = d?.daily || [];
  const maxRev = Math.max(1, ...daily.map((x) => x.revenue));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <Text style={s.h1}>Dashboard</Text>
          <Text style={s.bodyMuted}>ClickBook admin console</Text>
        </View>
        {!wide ? <Pressable testID="admin-logout" onPress={logout} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Feather name="log-out" size={20} color={colors.error} /></Pressable> : null}
      </View>
      <View style={styles.kpiGrid}>
        <Kpi label="Revenue" value={fmtMoney(d?.revenue)} hint={`${d?.paid_orders ?? 0} paid orders`} testID="kpi-revenue" />
        <Kpi label="Order volume" value={String(d?.total_orders ?? "…")} hint={`${d?.pending_payments ?? 0} awaiting payment`} testID="kpi-orders" />
        <Kpi label="Sheets sold" value={String(d?.sheets_sold ?? "…")} testID="kpi-sheets" />
        <Kpi label="Customers" value={String(d?.customers ?? "…")} hint={`${d?.albums ?? 0} albums · ${d?.drafts ?? 0} drafts`} testID="kpi-customers" />
      </View>

      <Text style={[s.label, { marginTop: spacing.xxl }]}>Revenue · last 14 days</Text>
      <View style={styles.chart} testID="dashboard-chart">
        {daily.map((x) => (
          <View key={x.date} style={styles.barCol}>
            <View style={[styles.bar, { height: Math.max(2, Math.round((x.revenue / maxRev) * 100)), backgroundColor: x.orders ? colors.brandPrimary : colors.borderStrong }]} />
            <Text style={styles.barLbl}>{x.date.slice(8)}</Text>
          </View>
        ))}
      </View>

      <Text style={[s.label, { marginTop: spacing.xxl }]}>Orders by production status</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
        {Object.entries(d?.by_status || {}).map(([k, v]) => <Badge key={k} label={`${k}: ${String(v)}`} tone="info" />)}
        {!Object.keys(d?.by_status || {}).length ? <Text style={s.bodyMuted}>No orders yet.</Text> : null}
      </View>

      <Text style={[s.label, { marginTop: spacing.xxl }]}>Recent orders</Text>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {(d?.recent_orders || []).map((o: any) => (
          <Pressable key={o.id} onPress={() => router.push("/admin/orders")} style={styles.recent} testID={`recent-order-${o.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.recentTitle}>{o.order_no} · {o.client_name || o.customer_snapshot?.name || "—"}</Text>
              <Text style={s.bodyMuted}>{o.sheets} sheets · {fmtMoney(o.price?.total)} · {fmtDate(o.created_at)}</Text>
            </View>
            <Badge label={o.payment_status === "paid" ? "paid" : "unpaid"} tone={o.payment_status === "paid" ? "good" : "warn"} />
          </Pressable>
        ))}
      </View>

      {!wide ? (
        <>
          <Text style={[s.label, { marginTop: spacing.xxl }]}>Manage</Text>
          {ADMIN_NAV.map((g) => (
            <View key={g.group} style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Text style={[s.bodyMuted, { fontSize: 12 }]}>{g.group}</Text>
              {g.items.filter((l) => l.key !== "dashboard").map((l) => (
                <Pressable key={l.key} testID={`admin-nav-${l.key}`} onPress={() => router.push(l.path as any)} style={styles.link}>
                  <Feather name={l.icon as any} size={18} color={colors.brandPrimary} />
                  <Text style={[s.h2, { marginLeft: spacing.md, flex: 1, fontSize: 15 }]}>{l.label}</Text>
                  <Feather name="chevron-right" size={18} color={colors.muted} />
                </Pressable>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xl },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 130, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "70%", borderRadius: 3 },
  barLbl: { fontFamily: fonts.text, fontSize: 9, color: colors.muted, marginTop: 4 },
  recent: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  recentTitle: { fontFamily: fonts.text, fontSize: 14, fontWeight: "700", color: colors.onSurface },
  link: { flexDirection: "row", alignItems: "center", padding: spacing.md, minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
});
