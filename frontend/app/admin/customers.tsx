import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminCustomers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["admin-customers"], queryFn: () => api.adminCustomers() });
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-customers-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Customers</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        {(q.data?.customers || []).map((c: any) => (
          <View key={c.id} style={styles.card} testID={`admin-customer-${c.id}`}>
            <View style={styles.avatar}><Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.text }}>{(c.name || c.mobile || "?").charAt(0).toUpperCase()}</Text></View>
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={s.h2}>{c.name || "—"}</Text>
              <Text style={s.bodyMuted}>+91 {c.mobile}</Text>
              {c.email ? <Text style={s.bodyMuted}>{c.email}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
