// Shared scaffolding for admin screens: top bar with back button + title, scrollable body, data table helpers.
import { ReactNode } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { s } from "@/src/ui";
import { colors, fonts, radius, spacing } from "@/src/theme";

export const ADMIN_NAV: { group: string; items: { key: string; label: string; icon: string; path: string }[] }[] = [
  { group: "Overview", items: [
    { key: "dashboard", label: "Dashboard", icon: "activity", path: "/admin/dashboard" },
    { key: "orders", label: "Orders", icon: "package", path: "/admin/orders" },
    { key: "payments", label: "Payments", icon: "credit-card", path: "/admin/payments" },
    { key: "customers", label: "Customers", icon: "users", path: "/admin/customers" },
    { key: "albums", label: "Albums", icon: "book-open", path: "/admin/albums" },
    { key: "production", label: "Production", icon: "printer", path: "/admin/production" },
  ] },
  { group: "Home page CMS", items: [
    { key: "home", label: "Home Page CMS", icon: "layout", path: "/admin/home" },
    { key: "heroes", label: "Hero Images", icon: "image", path: "/admin/heroes" },
    { key: "sliders", label: "Promotional Sliders", icon: "film", path: "/admin/sliders" },
    { key: "videos", label: "Videos", icon: "youtube", path: "/admin/videos" },
  ] },
  { group: "Album catalog", items: [
    { key: "covers", label: "Covers", icon: "book", path: "/admin/covers" },
    { key: "designs", label: "Album Designs", icon: "feather", path: "/admin/designs" },
    { key: "layouts", label: "Layouts", icon: "grid", path: "/admin/layouts" },
    { key: "backgrounds", label: "Backgrounds", icon: "droplet", path: "/admin/backgrounds" },
  ] },
  { group: "Marketing & system", items: [
    { key: "offers", label: "Offers / Coupons", icon: "tag", path: "/admin/offers" },
    { key: "notifications", label: "Notifications", icon: "bell", path: "/admin/notifications" },
    { key: "bots", label: "Process Bots", icon: "message-circle", path: "/admin/bots" },
    { key: "settings", label: "Settings", icon: "settings", path: "/admin/settings" },
  ] },
];

export function AdminPage({ title, children, right, refreshing, onRefresh, testID, scroll = true }: {
  title: string; children: ReactNode; right?: ReactNode; refreshing?: boolean; onRefresh?: () => void; testID?: string; scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const body = scroll ? (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 100 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} /> : undefined}>
      {children}
    </ScrollView>
  ) : <View style={{ flex: 1 }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }} testID={testID}>
      <View style={styles.topbar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin/dashboard"))} testID={`${testID || "admin"}-back`} hitSlop={12}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>{title}</Text>
        <View style={{ minWidth: 22, alignItems: "flex-end" }}>{right}</View>
      </View>
      {body}
    </View>
  );
}

export function useWide(breakpoint = 860) {
  const { width } = useWindowDimensions();
  return width >= breakpoint;
}

export type Col<T> = { key: string; label: string; flex?: number; render: (row: T) => ReactNode };

/** Responsive table: real columns on wide screens, stacked label/value cards on phones. */
export function DataTable<T extends { id: string }>({ rows, cols, onRowPress, testID, empty = "Nothing here yet." }: {
  rows: T[]; cols: Col<T>[]; onRowPress?: (row: T) => void; testID?: string; empty?: string;
}) {
  const wide = useWide();
  if (!rows.length) return <Text style={[s.bodyMuted, { marginTop: spacing.md }]}>{empty}</Text>;
  if (wide) {
    return (
      <View style={styles.table} testID={testID}>
        <View style={[styles.tr, styles.th]}>
          {cols.map((c) => <Text key={c.key} style={[styles.thTxt, { flex: c.flex || 1 }]}>{c.label}</Text>)}
        </View>
        {rows.map((r, i) => (
          <Pressable key={r.id} testID={`${testID}-row-${r.id}`} onPress={onRowPress ? () => onRowPress(r) : undefined} style={[styles.tr, i % 2 ? styles.trAlt : null]}>
            {cols.map((c) => <View key={c.key} style={{ flex: c.flex || 1, paddingRight: spacing.sm, justifyContent: "center" }}>{cell(c.render(r))}</View>)}
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      {rows.map((r) => (
        <Pressable key={r.id} testID={`${testID}-row-${r.id}`} onPress={onRowPress ? () => onRowPress(r) : undefined} style={styles.card}>
          {cols.map((c) => (
            <View key={c.key} style={styles.kv}>
              <Text style={styles.k}>{c.label}</Text>
              <View style={{ flex: 1, alignItems: "flex-end" }}>{cell(c.render(r))}</View>
            </View>
          ))}
        </Pressable>
      ))}
    </View>
  );
}

function cell(v: ReactNode) {
  return typeof v === "string" || typeof v === "number" ? <Text style={styles.td} numberOfLines={2}>{v}</Text> : v;
}

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" | "info"; testID?: string }) {
  const bg = tone === "good" ? "#E3F5EA" : tone === "warn" ? "#FFF2D9" : tone === "bad" ? "#FDE2E2" : tone === "info" ? colors.homeBlueSoft : colors.surfaceTertiary;
  const fg = tone === "good" ? "#1F7A44" : tone === "warn" ? "#9A5B00" : tone === "bad" ? colors.error : tone === "info" ? colors.homeBlue : colors.onSurface;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} testID={testID}>
      <Text style={{ color: fg, fontFamily: fonts.text, fontSize: 11, textTransform: "capitalize" }}>{label.replace(/_/g, " ")}</Text>
    </View>
  );
}

export function LinkChip({ label, icon, onPress, testID, disabled }: { label: string; icon: string; onPress: () => void; testID?: string; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} testID={testID} style={[styles.linkChip, disabled && { opacity: 0.4 }]}>
      <Feather name={icon as any} size={13} color={colors.brandPrimary} />
      <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function Kpi({ label, value, hint, testID }: { label: string; value: string; hint?: string; testID?: string }) {
  return (
    <View style={styles.kpi} testID={testID}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.h1, { marginTop: 2 }]}>{value}</Text>
      {hint ? <Text style={[s.bodyMuted, { fontSize: 12 }]}>{hint}</Text> : null}
    </View>
  );
}

export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtMoney = (n?: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl, paddingBottom: spacing.md },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary, marginTop: spacing.md },
  tr: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 10, minHeight: 48 },
  trAlt: { backgroundColor: colors.surface },
  th: { backgroundColor: colors.surfaceTertiary, borderBottomWidth: 1, borderBottomColor: colors.border },
  thTxt: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted },
  td: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurface },
  card: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, gap: 6 },
  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  k: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 110 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, minHeight: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignSelf: "flex-start" },
  kpi: { flexBasis: 160, flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary },
});
