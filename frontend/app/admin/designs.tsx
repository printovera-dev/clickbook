// Album Designs: the design system customers choose from — album styles (layout rhythm) and cover styles.
import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { View, Text, StyleSheet, Pressable, TextInput, Switch, Alert } from "react-native";
import { useRouter } from "expo-router";
import { AdminPage } from "@/src/components/admin-page";
import { ALBUM_STYLES, COVER_STYLES } from "@/src/design";
import { s, Button } from "@/src/ui";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminDesigns() {
  const router = useRouter();
  const [pageDesigns, setPageDesigns] = useState<any[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const loadPageDesigns = async () => {
    setLoadingDesigns(true);
    try { const r = await api.adminPageDesigns(); setPageDesigns(r.designs || []); }
    catch (e: any) { Alert.alert("Could not load page designs", e?.message || "Please try again"); }
    finally { setLoadingDesigns(false); }
  };
  useEffect(() => { loadPageDesigns(); }, []);
  const uploadMockFile = async (d: any) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset: any = result.assets[0];
      const uploaded = await api.adminUploadImage(asset.uri, asset.fileName || `mock-${d.segment || "general"}.jpg`, asset.file);
      const url = uploaded.image?.original_url || uploaded.image?.url;
      if (!url) throw new Error("Upload did not return a file URL");
      setPageDesigns((all) => all.map((x) => x.id === d.id ? { ...x, mock_file_url: url } : x));
      await api.adminUpdatePageDesign(d.id, { name: d.name, description: d.description || "", preset_key: d.preset_key, background: d.background, positions_by_count: d.positions_by_count, segment: d.segment || "All", mock_file_url: url, active: !!d.active, display_order: Number(d.display_order || 1) });
      await loadPageDesigns();
    } catch (e: any) { Alert.alert("Could not upload mock file", e?.message || "Please try again"); }
  };
  const savePageDesign = async (d: any) => {
    setSavingId(d.id);
    try {
      await api.adminUpdatePageDesign(d.id, { name: d.name, description: d.description || "", preset_key: d.preset_key, background: d.background, positions_by_count: d.positions_by_count, segment: d.segment || "All", mock_file_url: d.mock_file_url || null, active: !!d.active, display_order: Number(d.display_order || 1) });
      await loadPageDesigns();
    } catch (e: any) { Alert.alert("Could not save design", e?.message || "Please try again"); }
    finally { setSavingId(null); }
  };
  return (
    <AdminPage title="Album Designs" testID="admin-designs">
      <Text style={s.label}>Page design presets</Text>
      <Text style={[s.bodyMuted, { marginTop: 4 }]}>Manage general presets and the category-specific designs used during automatic album creation. Each design supports pages with 1–4 photos.</Text>
      {loadingDesigns ? <Text style={[s.bodyMuted, { marginTop: spacing.md }]}>Loading page designs…</Text> : null}
      <View style={styles.grid}>
        {pageDesigns.map((d) => (
          <View key={d.id} style={styles.card} testID={"admin-page-design-" + d.id}>
            <View style={{ width: 112, height: 90, alignSelf: "center", backgroundColor: d.background || "#FFFFFF", borderWidth: 1, borderColor: colors.border }}>
              {(d.positions_by_count?.["4"] || []).map((r: any, i: number) => <View key={i} style={{ position: "absolute", left: r.x * 112, top: r.y * 90, width: r.w * 112, height: r.h * 90, backgroundColor: d.preset_key === "cinematic" ? "#D6D3D1" : colors.borderStrong }} />)}
            </View>
            <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>{d.segment && d.segment !== "All" ? "Photo section: " + d.segment : "General page design"}</Text>
            <Text style={[s.label, { marginTop: spacing.sm }]}>Design name</Text>
            <TextInput value={d.name} onChangeText={(v) => setPageDesigns((all) => all.map((x) => x.id === d.id ? { ...x, name: v } : x))} style={styles.editInput} />
            <Text style={[s.label, { marginTop: spacing.sm }]}>Description</Text>
            <TextInput value={d.description || ""} onChangeText={(v) => setPageDesigns((all) => all.map((x) => x.id === d.id ? { ...x, description: v } : x))} style={styles.editInput} />
            <View style={styles.settingRow}><Text style={s.bodyMuted}>Background colour</Text><TextInput value={d.background} autoCapitalize="characters" onChangeText={(v) => setPageDesigns((all) => all.map((x) => x.id === d.id ? { ...x, background: v } : x))} style={[styles.editInput, { width: 110 }]} /></View>
            <View style={styles.settingRow}><Text style={s.bodyMuted}>Available to customers</Text><Switch value={!!d.active} onValueChange={(v) => setPageDesigns((all) => all.map((x) => x.id === d.id ? { ...x, active: v } : x))} /></View>
            <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>{d.mock_file_url ? "Mock/reference file attached" : "No mock/reference file uploaded"}</Text>
            <Button label="Upload mock file" variant="outline" onPress={() => uploadMockFile(d)} />
            <Button label={savingId === d.id ? "Saving…" : "Save design"} loading={savingId === d.id} onPress={() => savePageDesign(d)} />
          </View>
        ))}
      </View>
      {!loadingDesigns && pageDesigns.length === 0 ? <Text style={[s.bodyMuted, { marginTop: spacing.md }]}>No page designs are available yet. Check that the backend startup seed completed.</Text> : null}
      <Text style={s.label}>Album styles</Text>
      <Text style={[s.bodyMuted, { marginTop: 4 }]}>Each style defines the rhythm of photos per page used by the auto-designer.</Text>
      <View style={styles.grid}>
        {ALBUM_STYLES.map((st) => (
          <View key={st.key} style={styles.card} testID={`design-style-${st.key}`}>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {st.rhythm.map((n, i) => (
                <View key={i} style={styles.mini}>
                  {Array.from({ length: n }).map((_, j) => <View key={j} style={[styles.miniBox, { flexBasis: n === 1 ? "100%" : n === 2 ? "100%" : "46%", height: n === 1 ? "100%" : n === 2 ? "46%" : "46%" }]} />)}
                </View>
              ))}
            </View>
            <Text style={[s.h2, { marginTop: spacing.sm }]}>{st.name}</Text>
            <Text style={s.bodyMuted}>{st.desc}</Text>
            <Text style={[s.bodyMuted, { fontSize: 12, marginTop: 4 }]}>Rhythm: {st.rhythm.join(" · ")} photos / page</Text>
          </View>
        ))}
      </View>

      <Text style={[s.label, { marginTop: spacing.xxl }]}>Cover styles</Text>
      <Text style={[s.bodyMuted, { marginTop: 4 }]}>Frame + background used for the editable cover. Cover artwork images are managed under Covers.</Text>
      <View style={styles.grid}>
        {COVER_STYLES.map((c) => (
          <View key={c.key} style={styles.card} testID={`design-cover-${c.key}`}>
            <View style={{ width: 96, height: 96, backgroundColor: c.background, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ position: "absolute", left: c.frame.x * 96, top: c.frame.y * 96, width: c.frame.w * 96, height: c.frame.h * 96, backgroundColor: colors.borderStrong }} />
            </View>
            <Text style={[s.h2, { marginTop: spacing.sm }]}>{c.name}</Text>
            <Text style={[s.bodyMuted, { fontSize: 12 }]}>Frame {Math.round(c.frame.w * 100)}% × {Math.round(c.frame.h * 100)}% · bg {c.background}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={() => router.push("/admin/covers")} style={styles.link} testID="designs-go-covers">
        <Feather name="book" size={16} color={colors.brandPrimary} /><Text style={{ color: colors.brandPrimary, fontFamily: fonts.text }}>Manage cover artwork</Text>
      </Pressable>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md },
  card: { flexBasis: 260, flexGrow: 1, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  mini: { width: 36, height: 36, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 3, flexDirection: "row", flexWrap: "wrap", gap: 2, alignContent: "flex-start" },
  miniBox: { backgroundColor: colors.borderStrong, borderRadius: 1 },
  link: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, minHeight: 44 },
  editInput: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, color: colors.onSurface, backgroundColor: colors.surface, fontFamily: fonts.text },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginVertical: spacing.xs },
});
