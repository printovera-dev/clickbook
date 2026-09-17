import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, RefreshControl, Linking, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api, fileUrl } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

const STATUSES = ["processing", "printing", "packaging", "out_for_delivery", "delivered", "cancelled"];

function fmtBytes(n?: number) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export default function AdminOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin-orders", filter], queryFn: () => api.adminOrders(filter || undefined) });
  const orders = q.data?.orders || [];
  const downloads = useQuery({
    queryKey: ["admin-order-downloads", selected?.id],
    queryFn: () => api.adminOrderDownloads(selected.id),
    enabled: !!selected,
    refetchInterval: (query) => (query.state.data?.package?.status === "building" ? 3000 : false),
  });
  const pkg = downloads.data?.package;

  const updateStatus = async (nextStatus: string) => {
    if (!selected) return;
    await api.adminUpdateOrderStatus(selected.id, { production_status: nextStatus, note, tracking_number: tracking || undefined });
    setSelected(null); setNote(""); setTracking("");
    q.refetch();
  };
  const buildPackage = async () => {
    if (!selected) return;
    setBuilding(true); setBuildError(null);
    try {
      await api.adminGeneratePdf(selected.id);
      await downloads.refetch();
      q.refetch();
    } catch (e: any) {
      setBuildError(e.message || "Build failed");
    } finally {
      setBuilding(false);
    }
  };
  const openZip = async () => {
    if (!selected) return;
    Linking.openURL(await api.adminDownloadsZipUrl(selected.id));
  };
  const notifyCustomer = () => {
    if (!selected) return;
    const o = selected;
    setSelected(null);
    router.push({ pathname: "/admin/notifications", params: { customer_id: o.customer_id, order_id: o.id, order_no: o.order_no,
      customer_label: `${o.customer_snapshot?.name || "—"} · ${o.customer_snapshot?.mobile || ""}` } } as any);
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
          <View style={[styles.modal, { paddingBottom: insets.bottom + spacing.xl }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={s.h1}>{selected?.order_no}</Text>
              <Pressable onPress={() => setSelected(null)} testID="admin-order-close" hitSlop={12}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.bodyMuted}>{selected?.album_name}</Text>
            <Text style={s.bodyMuted}>Status: {selected?.production_status?.replace(/_/g, " ")} · {selected?.payment_status}{selected?.gift_wrap ? " · 🎁 Gift wrap" : ""}</Text>
            {selected?.gift_wrap && selected?.gift_note ? (
              <View style={styles.giftNoteCard} testID="admin-gift-note">
                <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.onBrandTertiary, textTransform: "uppercase", letterSpacing: 0.6 }}>Gift note</Text>
                <Text style={{ marginTop: 4, fontFamily: fonts.display, fontStyle: "italic", color: colors.onBrandTertiary, fontSize: 15 }}>&ldquo;{selected.gift_note}&rdquo;</Text>
              </View>
            ) : null}

            <Text style={[s.label, { marginTop: spacing.lg }]}>Update status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }} style={{ maxHeight: 56, marginTop: spacing.sm }}>
              {STATUSES.map((st) => (
                <Pressable key={st} onPress={() => updateStatus(st)} testID={`admin-status-${st}`} style={[styles.chip, styles.chipOutline]}>
                  <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontSize: 12 }}>{st.replace(/_/g, " ")}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput testID="admin-tracking-input" value={tracking} onChangeText={setTracking} placeholder="Tracking number (optional)" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput testID="admin-note-input" value={note} onChangeText={setNote} placeholder="Note (optional) — sent to the customer" placeholderTextColor={colors.muted} style={styles.input} />
            <Button testID="admin-notify-customer" label="Message customer" variant="outline" onPress={notifyCustomer} style={{ marginTop: spacing.md }} />

            <Text style={[s.label, { marginTop: spacing.xl }]}>Production files</Text>
            <View style={styles.pkgCard} testID="admin-production-package">
              {downloads.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
              {pkg?.status === "building" ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <ActivityIndicator color={colors.brandPrimary} />
                  <Text style={s.body}>Rendering print files…</Text>
                </View>
              ) : null}
              {pkg?.status === "failed" ? <Text style={{ color: colors.error, fontFamily: fonts.text }}>Render failed: {pkg.error}</Text> : null}
              {!pkg || pkg.status === "none" ? (
                <Text style={s.bodyMuted}>{selected?.payment_status === "paid" ? "Not built yet." : "Files are generated automatically once payment is received."}</Text>
              ) : null}
              {pkg?.status === "ready" ? (
                <View>
                  <Text style={[s.bodyMuted, { fontSize: 12 }]} testID="admin-package-dir">{pkg.dir}/ · {pkg.pages} pages · {fmtBytes(pkg.size_bytes)}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
                    <FileChip icon="file-text" label="Album.pdf" testID="admin-file-pdf" onPress={() => Linking.openURL(fileUrl(pkg.pdf_url)!)} />
                    <FileChip icon="image" label="Cover/cover.jpg" testID="admin-file-cover" onPress={() => Linking.openURL(fileUrl(pkg.cover_url)!)} />
                    <FileChip icon="layers" label={`Print/ (${pkg.pages} pages)`} testID="admin-file-print" onPress={() => Linking.openURL(fileUrl(pkg.print_urls?.[0])!)} />
                  </View>
                  <Button testID="admin-download-zip" label="Download all (ZIP)" onPress={openZip} style={{ marginTop: spacing.md }} size="sm" />
                </View>
              ) : null}
              {buildError ? <Text style={{ color: colors.error, fontFamily: fonts.text, marginTop: spacing.sm }}>{buildError}</Text> : null}
              <Button testID="admin-generate-pdf" label={pkg?.status === "ready" ? "Rebuild production files" : "Build production files"} variant="outline" size="sm" onPress={buildPackage} loading={building} style={{ marginTop: spacing.md }} />
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FileChip({ icon, label, onPress, testID }: { icon: string; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} style={styles.fileChip}>
      <Feather name={icon as any} size={14} color={colors.brandPrimary} />
      <Text style={{ color: colors.onSurface, fontFamily: fonts.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
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
  giftNoteCard: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandSecondary },
});
