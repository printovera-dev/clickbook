import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api, setAdminToken } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api.adminDashboard(), retry: false });
  const d = q.data;

  if (q.error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, padding: spacing.xl, paddingTop: insets.top + spacing.xxl, alignItems: "center" }}>
        <Text style={s.h2}>Session expired</Text>
        <Pressable onPress={() => router.replace("/admin/login")} style={{ marginTop: spacing.lg }}><Text style={{ color: colors.brandPrimary }}>Sign in again</Text></Pressable>
      </View>
    );
  }

  const links = [
    { key: "orders", label: "Orders", icon: "package", path: "/admin/orders" },
    { key: "covers", label: "Covers", icon: "book", path: "/admin/covers" },
    { key: "offers", label: "Offers", icon: "tag", path: "/admin/offers" },
    { key: "pricing", label: "Pricing", icon: "dollar-sign", path: "/admin/pricing" },
    { key: "bots", label: "Process Bots", icon: "message-circle", path: "/admin/bots" },
    { key: "notifications", label: "Notifications", icon: "bell", path: "/admin/notifications" },
    { key: "customers", label: "Customers", icon: "users", path: "/admin/customers" },
  ];

  const logout = async () => { await setAdminToken(null); router.replace("/admin/login"); };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={s.h1}>Admin</Text>
        <Pressable testID="admin-logout" onPress={logout}><Feather name="log-out" size={20} color={colors.error} /></Pressable>
      </View>
      <View style={styles.kpiGrid}>
        <Kpi label="Total orders" value={String(d?.total_orders ?? "…")} />
        <Kpi label="Revenue" value={`₹${d?.revenue ?? 0}`} />
        <Kpi label="Customers" value={String(d?.customers ?? "…")} />
        <Kpi label="Drafts" value={String(d?.drafts ?? "…")} />
      </View>
      <Text style={[s.label, { marginTop: spacing.xxl }]}>Orders by status</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
        {Object.entries(d?.by_status || {}).map(([k, v]) => (
          <View key={k} style={styles.chip}>
            <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.text, textTransform: "capitalize", fontSize: 12 }}>{k.replace(/_/g, " ")}: {String(v)}</Text>
          </View>
        ))}
      </View>
      <Text style={[s.label, { marginTop: spacing.xxl }]}>Manage</Text>
      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
        {links.map((l) => (
          <Pressable key={l.key} testID={`admin-nav-${l.key}`} onPress={() => router.push(l.path as any)} style={styles.link}>
            <Feather name={l.icon as any} size={20} color={colors.brandPrimary} />
            <Text style={[s.h2, { marginLeft: spacing.md, flex: 1 }]}>{l.label}</Text>
            <Feather name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.h1, { marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xl },
  kpi: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary },
  chip: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  link: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
});
