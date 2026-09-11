import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

const STATUSES = ["processing", "printing", "packaging", "out_for_delivery", "delivered", "cancelled"];

export default function AdminOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState("");
  const q = useQuery({ queryKey: ["admin-orders", filter], queryFn: () => api.adminOrders(filter || undefined) });
  const orders = q.data?.orders || [];

  const updateStatus = async (nextStatus: string) => {
    if (!selected) return;
    await api.adminUpdateOrderStatus(selected.id, { production_status: nextStatus, note, tracking_number: tracking || undefined });
    setSelected(null); setNote(""); setTracking("");
    q.refetch();
  };
  const genPdf = async () => {
    if (!selected) return;
    const r = await api.adminGeneratePdf(selected.id);
    q.refetch();
    setSelected({ ...selected, pdf_url: r.pdf_url });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-orders-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Orders</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md }} style={{ maxHeight: 56 }}>
        <Pressable onPress={() => setFilter(null)} style={[styles.chip, !filter && styles.chipActive]}><Text style={[styles.chipTxt, !filter && { color: colors.onBrandPrimary }]}>All</Text></Pressable>
        {STATUSES.map((s2) => (
          <Pressable key={s2} onPress={() => setFilter(s2)} style={[styles.chip, filter === s2 && styles.chipActive]}>
            <Text style={[styles.chipTxt, filter === s2 && { color: colors.onBrandPrimary }]}>{s2.replace(/_/g, " ")}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}>
        {orders.map((o: any) => (
          <Pressable key={o.id} testID={`admin-order-${o.id}`} onPress={() => setSelected(o)} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.h2}>{o.order_no}</Text>
              <Text style={s.bodyMuted}>{o.customer_snapshot?.name || "—"} · +91 {o.customer_snapshot?.mobile}</Text>
              <Text style={s.bodyMuted}>{o.sheets} sheets · ₹{o.price?.total} · {new Date(o.created_at).toLocaleDateString()}</Text>
              <View style={styles.badge}><Text style={{ color: colors.brandPrimary, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: fonts.text }}>{o.production_status?.replace(/_/g, " ")}</Text></View>
            </View>
            <Feather name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={s.h1}>{selected?.order_no}</Text>
              <Pressable onPress={() => setSelected(null)} testID="admin-order-close"><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.bodyMuted}>Status: {selected?.production_status?.replace(/_/g, " ")}{selected?.gift_wrap ? " · 🎁 Gift wrap" : ""}</Text>
            <Text style={[s.label, { marginTop: spacing.lg }]}>Update status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }} style={{ maxHeight: 56, marginTop: spacing.sm }}>
              {STATUSES.map((st) => (
                <Pressable key={st} onPress={() => updateStatus(st)} testID={`admin-status-${st}`} style={[styles.chip, styles.chipOutline]}>
                  <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 12 }}>{st.replace(/_/g, " ")}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput testID="admin-tracking-input" value={tracking} onChangeText={setTracking} placeholder="Tracking number (optional)" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput testID="admin-note-input" value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={colors.muted} style={styles.input} />
            <Button testID="admin-generate-pdf" label="Generate print PDF" variant="outline" onPress={genPdf} style={{ marginTop: spacing.lg }} />
            {selected?.pdf_url ? <Text style={[s.bodyMuted, { marginTop: 6 }]}>PDF ready ✓</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipOutline: { borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  chipTxt: { color: colors.onSurface, fontFamily: fonts.text, fontSize: 12, textTransform: "capitalize" },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  badge: { marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxxl },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
});
