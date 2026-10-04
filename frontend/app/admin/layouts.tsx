// Layouts: photo-slot templates (positions as page fractions). Add / enable / delete.
import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, TextInput, Alert, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { AdminPage } from "@/src/components/admin-page";
import { DEFAULT_POSITIONS } from "@/src/design";
import { Button, s } from "@/src/ui";
import { colors, fonts, radius, spacing } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminLayouts() {
  const q = useQuery({ queryKey: ["admin-layouts"], queryFn: () => api.adminLayouts() });
  const [name, setName] = useState("");
  const [count, setCount] = useState(2);
  const [err, setErr] = useState("");
  const layouts = q.data?.layouts || [];

  const toggle = async (l: any) => { await api.adminUpdateLayout(l.id, { name: l.name, photo_count: l.photo_count, positions: l.positions, active: !l.active }); q.refetch(); };
  const remove = (l: any) => {
    const doIt = async () => { await api.adminDeleteLayout(l.id); q.refetch(); };
    if (Platform.OS === "web") { if (window.confirm(`Delete layout "${l.name}"?`)) doIt(); return; }
    Alert.alert("Delete layout?", l.name, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: doIt }]);
  };
  const add = async () => {
    setErr("");
    if (!name.trim()) { setErr("Give the layout a name"); return; }
    try { await api.adminCreateLayout({ name: name.trim(), photo_count: count, positions: DEFAULT_POSITIONS[count], active: true }); setName(""); q.refetch(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <AdminPage title="Layouts" testID="admin-layouts" refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={styles.grid}>
        {layouts.map((l: any) => (
          <View key={l.id} style={[styles.card, !l.active && { opacity: 0.55 }]} testID={`layout-card-${l.id}`}>
            <View style={styles.preview}>
              {(l.positions || []).map((r: any, i: number) => <View key={i} style={{ position: "absolute", left: r.x * 96, top: r.y * 96, width: r.w * 96, height: r.h * 96, backgroundColor: colors.borderStrong }} />)}
            </View>
            <Text style={[s.h2, { marginTop: spacing.sm }]}>{l.name}</Text>
            <Text style={s.bodyMuted}>{l.photo_count} photo{l.photo_count > 1 ? "s" : ""}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
              <Switch value={!!l.active} onValueChange={() => toggle(l)} trackColor={{ true: colors.brandPrimary }} testID={`layout-active-${l.id}`} />
              <Pressable onPress={() => remove(l)} hitSlop={8} testID={`layout-delete-${l.id}`}><Feather name="trash-2" size={16} color={colors.error} /></Pressable>
            </View>
          </View>
        ))}
      </View>
      <Text style={[s.label, { marginTop: spacing.xxl }]}>Add layout</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Layout name (e.g. Gallery Quad)" placeholderTextColor={colors.muted} style={styles.input} testID="layout-name-input" />
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        {[1, 2, 3, 4].map((n) => (
          <Pressable key={n} onPress={() => setCount(n)} testID={`layout-count-${n}`} style={[styles.chip, count === n && styles.chipActive]}><Text style={[styles.chipTxt, count === n && { color: colors.onBrandPrimary }]}>{n} photo{n > 1 ? "s" : ""}</Text></Pressable>
        ))}
      </View>
      {err ? <Text style={{ color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text }}>{err}</Text> : null}
      <Button label="Add layout" onPress={add} style={{ marginTop: spacing.md }} testID="layout-add" />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { flexBasis: 180, flexGrow: 1, maxWidth: 260, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  preview: { width: 96, height: 96, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontFamily: fonts.text, fontSize: 12 },
});
