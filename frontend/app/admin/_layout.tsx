// Admin area shell: route guard (verifies the admin JWT with GET /admin/me, redirects guests to /admin/login)
// plus a persistent sidebar on wide screens. On phones the Dashboard screen acts as the menu.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, ActivityIndicator } from "react-native";
import { Slot, usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { api, getAdminToken, setAdminToken } from "@/src/api";
import { ADMIN_NAV } from "@/src/components/admin-page";
import { colors, fonts, radius, spacing } from "@/src/theme";


export default function AdminLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLogin = pathname === "/admin/login";
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    if (isLogin) return;
    let alive = true;
    (async () => {
      const t = await getAdminToken();
      if (!t) { if (alive) { setState("denied"); router.replace("/admin/login"); } return; }
      try { await api.adminMe(); if (alive) setState("ok"); }
      catch { await setAdminToken(null); if (alive) { setState("denied"); router.replace("/admin/login"); } }
    })();
    return () => { alive = false; };
  }, [isLogin, pathname, router]);

  if (isLogin) return <Slot />;
  if (state !== "ok") {
    return (
      <View style={styles.center} testID="admin-guard">
        <ActivityIndicator color={colors.brandPrimary} />
        <Text style={{ fontFamily: fonts.text, color: colors.muted, marginTop: spacing.md }}>{state === "checking" ? "Verifying admin session…" : "Redirecting to admin sign in…"}</Text>
      </View>
    );
  }

  const wide = width >= 960;
  const logout = async () => { await setAdminToken(null); router.replace("/admin/login"); };

  if (!wide) return <Slot />;
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.surface }}>
      <View style={[styles.sidebar, { paddingTop: insets.top + spacing.lg }]} testID="admin-sidebar">
        <View style={styles.brandRow}>
          <Text style={styles.brand}>Click<Text style={{ color: colors.homePink }}>Book</Text></Text>
          <Text style={styles.brandSub}>Admin console</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {ADMIN_NAV.map((g) => (
            <View key={g.group} style={{ marginTop: spacing.lg }}>
              <Text style={styles.group}>{g.group}</Text>
              {g.items.map((it) => {
                const active = pathname === it.path || pathname.startsWith(it.path + "/");
                return (
                  <Pressable key={it.key} testID={`admin-side-${it.key}`} onPress={() => router.push(it.path as any)} style={[styles.item, active && styles.itemActive]}>
                    <Feather name={it.icon as any} size={16} color={active ? colors.onBrandPrimary : colors.onSurface} />
                    <Text style={[styles.itemTxt, active && { color: colors.onBrandPrimary }]}>{it.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <Pressable testID="admin-side-logout" onPress={logout} style={[styles.item, { marginBottom: insets.bottom + spacing.md }]}>
          <Feather name="log-out" size={16} color={colors.error} />
          <Text style={[styles.itemTxt, { color: colors.error }]}>Sign out</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, width: "100%", maxWidth: 1240, alignSelf: "center" }}>
          <Slot />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  sidebar: { width: 248, backgroundColor: colors.homeCharcoal, paddingHorizontal: spacing.md },
  brandRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)" },
  brand: { fontFamily: fonts.text, fontSize: 22, fontWeight: "800", color: "#FFF", letterSpacing: -0.5 },
  brandSub: { fontFamily: fonts.text, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginTop: 2 },
  group: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", paddingHorizontal: spacing.md, marginBottom: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 40, borderRadius: radius.md },
  itemActive: { backgroundColor: colors.homePink },
  itemTxt: { fontFamily: fonts.text, fontSize: 13, color: "#FFF" },
});
