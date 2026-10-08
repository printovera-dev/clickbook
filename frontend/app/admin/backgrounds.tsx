// Backgrounds: page background colours offered in the editor.
import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, TextInput, Alert, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { AdminPage } from "@/src/components/admin-page";
import { Button, s } from "@/src/ui";
import { colors, fonts, radius, spacing } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

const HEX = /^#[0-9a-fA-F]{6}$/;

export default function AdminBackgrounds() {
  const q = useQuery({ queryKey: ["admin-backgrounds"], queryFn: () => api.adminBackgrounds() });
  const [name, setName] = useState("");
  const [color, setColor] = useState("#");
  const [err, setErr] = useState("");
  const bgs = q.data?.backgrounds || [];

  const toggle = async (b: any) => { await api.adminUpdateBackground(b.id, { name: b.name, color: b.color, image_url: b.image_url, active: !b.active }); q.refetch(); };
  const remove = (b: any) => {
    const doIt = async () => { await api.adminDeleteBackground(b.id); q.refetch(); };
    if (Platform.OS === "web") { if (window.confirm(`Delete background "${b.name}"?`)) doIt(); return; }
    Alert.alert("Delete background?", b.name, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: doIt }]);
  };
  const add = async () => {
    setErr("");
    if (!name.trim()) { setErr("Give the colour a name"); return; }
    if (!HEX.test(color)) { setErr("Colour must be a hex value like #F2D8CE"); return; }
    try { await api.adminCreateBackground({ name: name.trim(), color: color.toUpperCase(), active: true }); setName(""); setColor("#"); q.refetch(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <AdminPage title="Backgrounds" testID="admin-backgrounds" refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={styles.grid}>
        {bgs.map((b: any) => (
          <View key={b.id} style={[styles.card, !b.active && { opacity: 0.55 }]} testID={`bg-card-${b.id}`}>
            <View style={[styles.swatch, { backgroundColor: b.color }]} />
            <Text style={[s.h2, { marginTop: spacing.sm }]}>{b.name}</Text>
            <Text style={s.bodyMuted}>{b.color}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
              <Switch value={!!b.active} onValueChange={() => toggle(b)} trackColor={{ true: colors.brandPrimary }} testID={`bg-active-${b.id}`} />
              <Pressable onPress={() => remove(b)} hitSlop={8} testID={`bg-delete-${b.id}`}><Feather name="trash-2" size={16} color={colors.error} /></Pressable>
            </View>
          </View>
        ))}
      </View>
      <Text style={[s.label, { marginTop: spacing.xxl }]}>Add background colour</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. Blush)" placeholderTextColor={colors.muted} style={styles.input} testID="bg-name-input" />
      <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
        <TextInput value={color} onChangeText={setColor} autoCapitalize="characters" placeholder="#F2D8CE" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} testID="bg-color-input" />
        <View style={[styles.swatch, { width: 48, height: 48, marginTop: spacing.sm, backgroundColor: HEX.test(color) ? color : colors.surfaceTertiary }]} />
      </View>
      {err ? <Text style={{ color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text }}>{err}</Text> : null}
      <Button label="Add background" onPress={add} style={{ marginTop: spacing.md }} testID="bg-add" />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { flexBasis: 150, flexGrow: 1, maxWidth: 220, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  swatch: { width: "100%", height: 64, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
});
