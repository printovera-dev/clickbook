import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, Switch, Alert } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminBots() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["admin-bots"], queryFn: () => api.adminProcessBots() });
  const [editing, setEditing] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUploading(true);
    try {
      const r = await api.adminUploadImage(a.uri, a.fileName || `bot_${Date.now()}.jpg`, (a as any).file);
      setEditing((e: any) => ({ ...e, image_url: r.image.url }));
    } catch (e: any) { Alert.alert("Upload failed", e?.message || "Please try again"); } finally { setUploading(false); }
  };

  const save = async () => {
    if (!editing) return;
    await api.adminUpdateBot(editing.id, { label: editing.label, message: editing.message, icon: editing.icon, active: editing.active, image_url: editing.image_url ?? "" });
    setEditing(null); q.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-bots-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Process Bots</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        {(q.data?.process_bots || []).map((b: any) => (
          <Pressable key={b.id} testID={`admin-bot-${b.id}`} onPress={() => setEditing(b)} style={styles.card}>
            <View style={styles.iconBubble}>
              <Feather name={b.icon as any} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={s.h2}>{b.label}</Text>
              <Text style={s.bodyMuted}>{b.message}</Text>
              <Text style={s.bodyMuted}>Stage: {b.stage} · {b.active ? "Active" : "Inactive"}</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.h1}>{editing?.label}</Text>
              <Pressable onPress={() => setEditing(null)}><Feather name="x" size={22} color={colors.onSurface} /></Pressable>
            </View>
            <TextInput testID="bot-label" value={editing?.label} placeholder="Label" placeholderTextColor={colors.muted} onChangeText={(t) => setEditing({ ...editing, label: t })} style={styles.input} />
            <TextInput testID="bot-message" value={editing?.message} placeholder="Message" placeholderTextColor={colors.muted} onChangeText={(t) => setEditing({ ...editing, message: t })} style={styles.input} multiline />
            {editing?.image_url ? <Image source={{ uri: editing.image_url }} style={{ width: "100%", height: 120, borderRadius: radius.sm, marginBottom: spacing.sm }} contentFit="cover" /> : null}
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
              <Button testID="bot-upload-image" label={uploading ? "Uploading…" : editing?.image_url ? "Replace image" : "Upload image"} variant="outline" onPress={pickImage} loading={uploading} style={{ flex: 1 }} />
              {editing?.image_url ? <Button testID="bot-remove-image" label="Remove" variant="outline" onPress={() => setEditing({ ...editing, image_url: "" })} /> : null}
            </View>
            <TextInput testID="bot-icon" value={editing?.icon} placeholder="Feather icon name" placeholderTextColor={colors.muted} autoCapitalize="none" onChangeText={(t) => setEditing({ ...editing, icon: t })} style={styles.input} />
            <View style={styles.switchRow}><Text style={s.body}>Active</Text><Switch value={!!editing?.active} onValueChange={(v) => setEditing({ ...editing, active: v })} /></View>
            <Button testID="bot-save" label="Save" onPress={save} style={{ marginTop: spacing.lg }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  iconBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xxxl },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
});
