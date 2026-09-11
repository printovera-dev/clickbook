import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, Switch } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminOffers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["admin-offers"], queryFn: () => api.adminOffers() });
  const [editing, setEditing] = useState<any | null>(null);

  const save = async () => {
    if (!editing) return;
    const payload = {
      name: editing.name || "",
      code: (editing.code || "").toUpperCase(),
      discount_type: editing.discount_type || "percentage",
      value: Number(editing.value) || 0,
      min_order: Number(editing.min_order) || 0,
      max_discount: editing.max_discount ? Number(editing.max_discount) : null,
      start_at: editing.start_at || null,
      end_at: editing.end_at || null,
      active: !!editing.active,
      public: editing.public !== false,
    };
    if (editing.id) await api.adminUpdateOffer(editing.id, payload);
    else await api.adminCreateOffer(payload);
    setEditing(null); q.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-offers-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Offers</Text>
        <Pressable testID="admin-offer-add" onPress={() => setEditing({ name: "", code: "", discount_type: "percentage", value: 10, min_order: 0, active: true, public: true })}><Feather name="plus" size={22} color={colors.brandPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        {(q.data?.offers || []).map((o: any) => (
          <Pressable key={o.id} testID={`admin-offer-${o.id}`} onPress={() => setEditing(o)} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={s.h2}>{o.name}</Text>
              <Text style={s.bodyMuted}>{o.code} · {o.discount_type === "percentage" ? `${o.value}% off` : `₹${o.value} off`}</Text>
              <Text style={s.bodyMuted}>{o.active ? "Active" : "Inactive"} · used {o.usage_count || 0}</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalWrap}>
          <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.h1}>{editing?.id ? "Edit offer" : "New offer"}</Text>
              <Pressable onPress={() => setEditing(null)}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <TextInput testID="offer-name" placeholder="Name" placeholderTextColor={colors.muted} value={editing?.name} onChangeText={(t) => setEditing({ ...editing, name: t })} style={styles.input} />
            <TextInput testID="offer-code" placeholder="Code (e.g. WELCOME2026)" placeholderTextColor={colors.muted} value={editing?.code} autoCapitalize="characters" onChangeText={(t) => setEditing({ ...editing, code: t })} style={styles.input} />
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
              <Pressable onPress={() => setEditing({ ...editing, discount_type: "percentage" })} style={[styles.typeBtn, editing?.discount_type === "percentage" && styles.typeBtnActive]}><Text style={{ color: editing?.discount_type === "percentage" ? colors.onBrandPrimary : colors.onSurface, fontFamily: fonts.text }}>% off</Text></Pressable>
              <Pressable onPress={() => setEditing({ ...editing, discount_type: "fixed" })} style={[styles.typeBtn, editing?.discount_type === "fixed" && styles.typeBtnActive]}><Text style={{ color: editing?.discount_type === "fixed" ? colors.onBrandPrimary : colors.onSurface, fontFamily: fonts.text }}>Flat ₹ off</Text></Pressable>
            </View>
            <TextInput testID="offer-value" placeholder="Value" placeholderTextColor={colors.muted} value={String(editing?.value ?? "")} keyboardType="numeric" onChangeText={(t) => setEditing({ ...editing, value: t })} style={styles.input} />
            <TextInput testID="offer-min" placeholder="Min order (₹)" placeholderTextColor={colors.muted} value={String(editing?.min_order ?? "")} keyboardType="numeric" onChangeText={(t) => setEditing({ ...editing, min_order: t })} style={styles.input} />
            <TextInput testID="offer-max" placeholder="Max discount (₹, optional)" placeholderTextColor={colors.muted} value={String(editing?.max_discount ?? "")} keyboardType="numeric" onChangeText={(t) => setEditing({ ...editing, max_discount: t })} style={styles.input} />
            <TextInput testID="offer-end" placeholder="End at ISO (optional)" placeholderTextColor={colors.muted} value={editing?.end_at || ""} onChangeText={(t) => setEditing({ ...editing, end_at: t })} autoCapitalize="none" style={styles.input} />
            <View style={styles.switchRow}><Text style={s.body}>Active</Text><Switch value={!!editing?.active} onValueChange={(v) => setEditing({ ...editing, active: v })} /></View>
            <View style={styles.switchRow}><Text style={s.body}>Public (show on home)</Text><Switch value={editing?.public !== false} onValueChange={(v) => setEditing({ ...editing, public: v })} /></View>
            <Button testID="offer-save" label="Save" onPress={save} style={{ marginTop: spacing.lg }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxxl },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  typeBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center" },
  typeBtnActive: { backgroundColor: colors.brandPrimary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, paddingVertical: spacing.sm },
});
