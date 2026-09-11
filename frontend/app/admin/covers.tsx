import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, Switch } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminCovers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["admin-covers"], queryFn: () => api.adminListCovers() });
  const [editing, setEditing] = useState<any | null>(null);

  const save = async () => {
    if (!editing) return;
    const payload = { name: editing.name, description: editing.description || "", image_url: editing.image_url, active: !!editing.active, display_order: Number(editing.display_order) || 0 };
    if (editing.id) await api.adminUpdateCover(editing.id, payload);
    else await api.adminCreateCover(payload);
    setEditing(null);
    q.refetch();
  };
  const remove = async () => {
    if (!editing?.id) return;
    await api.adminDeleteCover(editing.id);
    setEditing(null); q.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-covers-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Covers</Text>
        <Pressable testID="admin-cover-add" onPress={() => setEditing({ name: "", description: "", image_url: "", active: true, display_order: 0 })}><Feather name="plus" size={22} color={colors.brandPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        {(q.data?.covers || []).map((c: any) => (
          <Pressable key={c.id} testID={`admin-cover-${c.id}`} onPress={() => setEditing(c)} style={styles.card}>
            <Image source={{ uri: c.image_url }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={s.h2}>{c.name}</Text>
              <Text style={s.bodyMuted}>{c.description}</Text>
              <Text style={s.bodyMuted}>Order {c.display_order} · {c.active ? "Active" : "Inactive"}</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.h1}>{editing?.id ? "Edit cover" : "New cover"}</Text>
              <Pressable onPress={() => setEditing(null)}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <TextInput testID="cover-name" placeholder="Name" placeholderTextColor={colors.muted} value={editing?.name} onChangeText={(t) => setEditing({ ...editing, name: t })} style={styles.input} />
            <TextInput testID="cover-desc" placeholder="Description" placeholderTextColor={colors.muted} value={editing?.description} onChangeText={(t) => setEditing({ ...editing, description: t })} style={styles.input} />
            <TextInput testID="cover-image" placeholder="Image URL" placeholderTextColor={colors.muted} value={editing?.image_url} autoCapitalize="none" onChangeText={(t) => setEditing({ ...editing, image_url: t })} style={styles.input} />
            <TextInput testID="cover-order" placeholder="Display order" placeholderTextColor={colors.muted} value={String(editing?.display_order ?? "")} keyboardType="number-pad" onChangeText={(t) => setEditing({ ...editing, display_order: Number(t) || 0 })} style={styles.input} />
            <View style={styles.switchRow}><Text style={s.body}>Active</Text><Switch value={!!editing?.active} onValueChange={(v) => setEditing({ ...editing, active: v })} /></View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.lg }}>
              {editing?.id ? <Button testID="cover-delete" label="Delete" variant="outline" onPress={remove} style={{ flex: 1 }} /> : null}
              <Button testID="cover-save" label="Save" onPress={save} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxxl },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
});
