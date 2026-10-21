import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AdminPage } from "@/src/components/admin-page";
import { api, fileUrl } from "@/src/api";
import { colors, fonts, spacing, radius } from "@/src/theme";
import { s, Button } from "@/src/ui";

const PRODUCTS = ["Visiting Cards", "Wedding Cards", "Brochures", "Letterheads"];
const LANGUAGES = ["Both", "English", "Hindi"];
const EMPTY = { product: "Visiting Cards", name: "", description: "", language: "Both", size_label: "Standard", sides: ["front", "back"], preview_image_url: "", active: true, display_order: 0 };

export default function PrintStudioTemplatesAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>({ ...EMPTY });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const r = await api.adminPrintStudioTemplates(); setItems(r.templates || []); } catch (e: any) { Alert.alert("Print Studio templates", e?.message || "Could not load templates"); } };
  useEffect(() => { load(); }, []);
  const patch = (key: string, value: any) => setDraft((d: any) => ({ ...d, [key]: value }));
  const uploadMock = async () => {
    try {
      const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (pick.canceled || !pick.assets?.[0]) return;
      const a: any = pick.assets[0];
      const up = await api.adminUploadImage(a.uri, a.fileName || "print-studio-template.jpg", a.file);
      const url = up.image?.original_url || up.image?.url;
      if (!url) throw new Error("Upload did not return a URL");
      patch("preview_image_url", url);
    } catch (e: any) { Alert.alert("Mock upload failed", e?.message || "Try again"); }
  };
  const save = async () => {
    if (!draft.name.trim() || !draft.preview_image_url.trim()) { Alert.alert("Required", "Add a template name and upload its mock preview image."); return; }
    setBusy(true);
    try {
      const payload = { ...draft, display_order: Number(draft.display_order || 0), sides: draft.sides.length ? draft.sides : ["front"] };
      if (editing) await api.updatePrintStudioTemplate(editing, payload);
      else await api.createPrintStudioTemplate(payload);
      setDraft({ ...EMPTY }); setEditing(null); await load();
    } catch (e: any) { Alert.alert("Could not save template", e?.message || "Try again"); }
    finally { setBusy(false); }
  };
  const edit = (item: any) => { setEditing(item.id); setDraft({ ...EMPTY, ...item }); };
  const remove = (id: string) => Alert.alert("Delete template?", "This removes it from the Print Studio template library.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { try { await api.deletePrintStudioTemplate(id); await load(); } catch (e: any) { Alert.alert("Delete failed", e?.message || "Try again"); } } }]);
  return <AdminPage title="Printovera Print Studio Templates" testID="admin-print-studio-templates">
    <Text style={s.bodyMuted}>Manage mock designs separately for visiting cards, wedding cards, brochures and letterheads. These are Print Studio templates, not album designs.</Text>
    <View style={styles.card}>
      <Text style={s.h2}>{editing ? "Edit template" : "Add a mock design"}</Text>
      <Text style={s.label}>Product</Text>
      <View style={styles.row}>{PRODUCTS.map(p => <Pressable key={p} onPress={() => patch("product", p)} style={[styles.chip, draft.product === p && styles.selected]}><Text style={styles.chipText}>{p}</Text></Pressable>)}</View>
      <Text style={s.label}>Template name</Text><TextInput value={draft.name} onChangeText={v => patch("name", v)} placeholder="e.g. Premium UV Visiting Card" style={styles.input}/>
      <Text style={s.label}>Description</Text><TextInput value={draft.description} onChangeText={v => patch("description", v)} placeholder="Describe the design" style={styles.input}/>
      <Text style={s.label}>Language support</Text><View style={styles.row}>{LANGUAGES.map(l => <Pressable key={l} onPress={() => patch("language", l)} style={[styles.chip, draft.language === l && styles.selected]}><Text style={styles.chipText}>{l}</Text></Pressable>)}</View>
      <Text style={s.label}>Size / format</Text><TextInput value={draft.size_label} onChangeText={v => patch("size_label", v)} placeholder="Standard / A4 / Tri-fold" style={styles.input}/>
      <Text style={s.label}>Sides / pages</Text><View style={styles.row}>{["front", "back", "page"].map(side => <Pressable key={side} onPress={() => patch("sides", draft.sides.includes(side) ? draft.sides.filter((x: string) => x !== side) : [...draft.sides, side])} style={[styles.chip, draft.sides.includes(side) && styles.selected]}><Text style={styles.chipText}>{side}</Text></Pressable>)}</View>
      <Text style={s.label}>Mock design preview image</Text>
      <Button label={draft.preview_image_url ? "Replace mock design image" : "Upload mock design image"} variant="outline" onPress={uploadMock}/>
      {draft.preview_image_url ? <Image source={{ uri: fileUrl(draft.preview_image_url) || draft.preview_image_url }} resizeMode="contain" style={styles.preview}/> : null}
      <View style={styles.rowBetween}><Text style={s.label}>Visible to customers</Text><Switch value={!!draft.active} onValueChange={v => patch("active", v)}/></View>
      <Text style={s.label}>Display order</Text><TextInput value={String(draft.display_order ?? 0)} keyboardType="number-pad" onChangeText={v => patch("display_order", v.replace(/[^0-9]/g, ""))} style={styles.input}/>
      <Button label={busy ? "Saving…" : editing ? "Save changes" : "Create template"} loading={busy} onPress={save}/>
      {editing ? <Button label="Cancel edit" variant="outline" onPress={() => { setDraft({ ...EMPTY }); setEditing(null); }}/> : null}
    </View>
    <Text style={[s.h2, { marginTop: spacing.xl }]}>Published and draft designs ({items.length})</Text>
    {items.map(item => <View key={item.id} style={styles.item}>
      {item.preview_image_url ? <Image source={{ uri: fileUrl(item.preview_image_url) || item.preview_image_url }} style={styles.thumb} resizeMode="contain"/> : null}
      <View style={{ flex: 1, gap: 3 }}><Text style={s.label}>{item.name}</Text><Text style={s.bodyMuted}>{item.product} · {item.language} · {item.size_label}</Text><Text style={s.bodyMuted}>{item.active ? "Published" : "Hidden"}</Text></View>
      <Pressable onPress={() => edit(item)}><Text style={styles.action}>Edit</Text></Pressable>
      <Pressable onPress={() => remove(item.id)}><Text style={[styles.action, { color: colors.error }]}>Delete</Text></Pressable>
    </View>)}
  </AdminPage>;
}
const styles = StyleSheet.create({
 card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary, marginTop: spacing.md, gap: spacing.sm },
 row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface },
 selected: { backgroundColor: colors.homeBlueSoft, borderColor: colors.homeBlue }, chipText: { color: colors.onSurface, fontFamily: fonts.text, fontSize: 12 },
 input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, backgroundColor: colors.surface, color: colors.onSurface, fontFamily: fonts.text },
 preview: { width: "100%", height: 170, backgroundColor: "#fff", borderRadius: radius.md }, rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
 item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderColor: colors.border },
 thumb: { width: 72, height: 54, backgroundColor: "#fff" }, action: { color: colors.brandPrimary, fontFamily: fonts.text, fontWeight: "700", padding: 6 }
});
