import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { Button, s, timeAgo } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

const TYPES = [
  { key: "general", label: "General", icon: "bell" },
  { key: "offer", label: "Offer", icon: "tag" },
  { key: "correction", label: "Correction", icon: "alert-circle" },
  { key: "status", label: "Status update", icon: "truck" },
];

export default function AdminNotifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ customer_id?: string; order_id?: string; order_no?: string; customer_label?: string }>();
  const [customerId, setCustomerId] = useState<string | null>(params.customer_id || null);
  const [customerLabel, setCustomerLabel] = useState<string>(params.customer_label || "");
  const [orderId] = useState<string | null>(params.order_id || null);
  const [type, setType] = useState(params.order_id ? "correction" : "general");
  const [title, setTitle] = useState(params.order_no ? `Order ${params.order_no}` : "");
  const [body, setBody] = useState("");
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useQuery({ queryKey: ["admin-notifications"], queryFn: () => api.adminNotifications() });
  const customers = useQuery({ queryKey: ["admin-customers"], queryFn: () => api.adminCustomers(), enabled: picker });
  const filtered = (customers.data?.customers || []).filter((c: any) =>
    !search || (c.name || "").toLowerCase().includes(search.toLowerCase()) || (c.mobile || "").includes(search));

  const send = async () => {
    setError(null); setResult(null); setSending(true);
    try {
      const r = await api.adminSendNotification({ title, body, type, customer_id: customerId, order_id: orderId });
      setResult(r.broadcast ? `Sent to all ${r.sent} customers` : "Sent to 1 customer");
      setTitle(params.order_no ? `Order ${params.order_no}` : ""); setBody("");
      history.refetch();
    } catch (e: any) {
      setError(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-notifications-back" hitSlop={12}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled">
          <Text style={s.h1}>Send a message</Text>

          <Text style={[s.label, { marginTop: spacing.xl }]}>To</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable testID="notify-target-all" onPress={() => { setCustomerId(null); setCustomerLabel(""); }} style={[styles.chip, !customerId && styles.chipActive]}>
              <Feather name="users" size={14} color={!customerId ? colors.onBrandPrimary : colors.onSurface} />
              <Text style={[styles.chipTxt, !customerId && { color: colors.onBrandPrimary }]}>All customers</Text>
            </Pressable>
            <Pressable testID="notify-target-one" onPress={() => setPicker(true)} style={[styles.chip, !!customerId && styles.chipActive, { flex: 1 }]}>
              <Feather name="user" size={14} color={customerId ? colors.onBrandPrimary : colors.onSurface} />
              <Text style={[styles.chipTxt, !!customerId && { color: colors.onBrandPrimary }]} numberOfLines={1}>{customerId ? customerLabel || "1 customer" : "One customer…"}</Text>
            </Pressable>
          </View>
          {orderId ? <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Linked to order {params.order_no} — customer can tap through to it.</Text> : null}

          <Text style={[s.label, { marginTop: spacing.xl }]}>Type</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {TYPES.map((t) => (
              <Pressable key={t.key} testID={`notify-type-${t.key}`} onPress={() => setType(t.key)} style={[styles.chip, type === t.key && styles.chipActive]}>
                <Feather name={t.icon as any} size={14} color={type === t.key ? colors.onBrandPrimary : colors.onSurface} />
                <Text style={[styles.chipTxt, type === t.key && { color: colors.onBrandPrimary }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.label, { marginTop: spacing.xl }]}>Title</Text>
          <TextInput testID="notify-title" value={title} onChangeText={setTitle} placeholder="e.g. Your offer expires tonight" placeholderTextColor={colors.muted} style={styles.input} maxLength={80} />
          <Text style={[s.label, { marginTop: spacing.lg }]}>Message</Text>
          <TextInput testID="notify-body" value={body} onChangeText={setBody} multiline placeholder="Write the message your customer will see…" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 100, textAlignVertical: "top" }]} maxLength={400} />

          {error ? <Text style={{ color: colors.error, fontFamily: fonts.text, marginTop: spacing.md }} testID="notify-error">{error}</Text> : null}
          {result ? <Text style={{ color: colors.success, fontFamily: fonts.text, marginTop: spacing.md }} testID="notify-result">{result} ✓</Text> : null}
          <Button testID="notify-send" label={customerId ? "Send to customer" : "Send to all customers"} onPress={send} loading={sending} disabled={!title.trim() || !body.trim()} style={{ marginTop: spacing.lg }} />

          <Text style={[s.label, { marginTop: spacing.xxxl }]}>Recently sent</Text>
          {(history.data?.notifications || []).length === 0 ? (
            <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Nothing sent yet.</Text>
          ) : (history.data?.notifications || []).map((n: any) => (
            <View key={n.id} style={styles.histCard} testID={`admin-notification-${n.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[s.label, { color: colors.brandPrimary }]}>{n.type} · {n.created_by === "system" ? "auto" : n.created_by}</Text>
                <Text style={[s.bodyMuted, { fontSize: 12 }]}>{timeAgo(n.created_at)}</Text>
              </View>
              <Text style={[s.body, { fontWeight: "600", marginTop: 2 }]}>{n.title}</Text>
              <Text style={s.bodyMuted} numberOfLines={2}>{n.body}</Text>
              <Text style={[s.bodyMuted, { fontSize: 12, marginTop: spacing.xs }]}>
                {n.customer ? `To ${n.customer.name || "—"} · +91 ${n.customer.mobile}` : `Broadcast · ${n.recipients} customers`} · read {n.read_count}/{n.recipients}
              </Text>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={s.h2}>Choose customer</Text>
              <Pressable onPress={() => setPicker(false)} testID="customer-picker-close" hitSlop={12}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <TextInput testID="customer-picker-search" value={search} onChangeText={setSearch} placeholder="Search name or mobile" placeholderTextColor={colors.muted} style={styles.input} autoFocus />
            <ScrollView style={{ maxHeight: 360, marginTop: spacing.md }} keyboardShouldPersistTaps="handled">
              {filtered.map((c: any) => (
                <Pressable key={c.id} testID={`customer-pick-${c.id}`} style={styles.custRow}
                  onPress={() => { setCustomerId(c.id); setCustomerLabel(`${c.name || "—"} · ${c.mobile}`); setPicker(false); }}>
                  <View style={styles.avatar}><Text style={{ color: colors.onBrandPrimary, fontFamily: fonts.text }}>{(c.name || c.mobile || "?").charAt(0).toUpperCase()}</Text></View>
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text style={s.body}>{c.name || "—"}</Text>
                    <Text style={s.bodyMuted}>+91 {c.mobile}</Text>
                  </View>
                  {customerId === c.id ? <Feather name="check" size={18} color={colors.brandPrimary} /> : null}
                </Pressable>
              ))}
              {customers.isFetched && filtered.length === 0 ? <Text style={[s.bodyMuted, { padding: spacing.md }]}>No customers match.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, minHeight: 44 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontFamily: fonts.text, fontSize: 13 },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, fontSize: 15, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  histCard: { marginTop: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  custRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 56 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
});
