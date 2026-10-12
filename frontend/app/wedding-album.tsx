import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Feather from "@react-native-vector-icons/feather";
import { api, fileUrl } from "@/src/api";
import { FluidImage } from "@/src/components/fluid-image";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

type AlbumSize = "12x18" | "24x24";
type Finish = "gloss" | "matte";
type Material = "digital" | "acrylic";

export default function WeddingAlbumSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<AlbumSize>("12x18");
  const [finish, setFinish] = useState<Finish>("gloss");
  const [material, setMaterial] = useState<Material>("digital");
  const [coverId, setCoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const coversQuery = useQuery({
    queryKey: ["covers", "wedding-album"],
    queryFn: () => api.listCovers(0, 100),
  });
  const covers = useMemo(() => {
    const all = coversQuery.data?.covers || [];
    // Honour catalog compatibility metadata when present; older catalog entries remain selectable.
    const compatible = all.filter((c: any) => {
      const allowed = c.compatible_materials || c.cover_materials;
      return !Array.isArray(allowed) || allowed.length === 0 || allowed.includes(material);
    });

    // Prefer one catalog design for each established style instead of accidentally
    // showing three covers from the same style just because of catalog order.
    const styleOrder = ["signature", "classic", "editorial"];
    const selected: any[] = [];
    const used = new Set<string>();
    for (const style of styleOrder) {
      const match = compatible.find((c: any) => String(c.style || "").toLowerCase() === style && !used.has(c.id));
      if (match) {
        selected.push(match);
        used.add(match.id);
      }
    }
    // Older catalog records may not have a style field. Fill missing slots with
    // distinct compatible covers so older catalogs remain usable.
    for (const cover of compatible) {
      if (selected.length >= 3) break;
      if (!used.has(cover.id)) {
        selected.push(cover);
        used.add(cover.id);
      }
    }
    return selected;
  }, [coversQuery.data, material]);

  const create = async () => {
    if (!coverId) { setError("Please select a cover design."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await api.createAlbum(
        coverId,
        "My Wedding Album",
        { size, paper_finish: finish, cover_material: material },
      );
      router.replace({ pathname: "/create/upload", params: { albumId: result.album.id, project: "wedding" } });
    } catch (e: any) {
      setError(e?.message || "Could not create your wedding album. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.label}>WEDDING ALBUM STUDIO</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 150, width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <Text style={s.h1}>Create your wedding album</Text>
        <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Choose the print size, paper finish and cover. You can upload and organise your photographs in the next step.</Text>

        <Text style={[s.h2, styles.sectionTitle]}>1. Album size</Text>
        <View style={styles.optionRow}>
          <Option title="12 × 18 inch" subtitle="Portrait landscape format" active={size === "12x18"} onPress={() => setSize("12x18")} />
          <Option title="24 × 24 inch" subtitle="Large square album" active={size === "24x24"} onPress={() => setSize("24x24")} />
        </View>

        <Text style={[s.h2, styles.sectionTitle]}>2. Paper finish</Text>
        <View style={styles.optionRow}>
          <Option title="Gloss" subtitle="Shiny, vivid finish" active={finish === "gloss"} onPress={() => setFinish("gloss")} />
          <Option title="Matte" subtitle="Soft, low-reflection finish" active={finish === "matte"} onPress={() => setFinish("matte")} />
        </View>

        <Text style={[s.h2, styles.sectionTitle]}>3. Cover material</Text>
        <View style={styles.optionRow}>
          <Option title="Digital" subtitle="Printed cover" active={material === "digital"} onPress={() => { setMaterial("digital"); setCoverId(null); }} />
          <Option title="Acrylic" subtitle="Glossy acrylic-look cover" active={material === "acrylic"} onPress={() => { setMaterial("acrylic"); setCoverId(null); }} />
        </View>

        <View style={[styles.rowBetween, styles.sectionTitle]}>
          <Text style={s.h2}>4. Choose a cover design</Text>
          <Text style={s.bodyMuted}>{covers.length} shown</Text>
        </View>
        {coversQuery.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.xl }} /> : null}
        {coversQuery.isError ? <Text style={styles.error}>Could not load the existing cover designs. Please try again.</Text> : null}
        {!coversQuery.isLoading && !coversQuery.isError && covers.length === 0 ? (
          <Text style={s.bodyMuted}>No compatible cover designs were found in the current catalog.</Text>
        ) : null}
        <View style={styles.coverList}>
          {covers.map((cover: any) => {
            const active = coverId === cover.id;
            return (
              <Pressable key={cover.id} onPress={() => { setCoverId(cover.id); setError(""); }} style={[styles.coverCard, active && styles.coverCardActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <FluidImage uri={fileUrl(cover.image_url)} width={180} ratio={1} maxHeight={180} recyclingKey={cover.id} style={styles.coverImage} />
                <View style={{ padding: spacing.md }}>
                  <Text style={s.h2}>{cover.name}</Text>
                  {cover.style ? <Text style={[styles.coverStyle, { marginTop: 3 }]}>{String(cover.style).toUpperCase()}</Text> : null}
                  {cover.description ? <Text style={[s.bodyMuted, { marginTop: 3 }]}>{cover.description}</Text> : null}
                  {active ? <Text style={styles.selectedText}>✓ Selected</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={[s.bodyMuted, { marginTop: spacing.md }]}>The material choice is saved with this album. Final production specifications and cover-material compatibility must be confirmed before print ordering is enabled.</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Continue to photo upload" onPress={create} disabled={!coverId || coversQuery.isLoading || covers.length === 0} loading={busy} />
      </View>
    </View>
  );
}

function Option({ title, subtitle, active, onPress }: { title: string; subtitle: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.option, active && styles.optionActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <View style={styles.optionHeader}>
        <Text style={[styles.optionTitle, active && { color: colors.brandPrimary }]}>{title}</Text>
        <View style={[styles.radio, active && styles.radioActive]}>{active ? <Feather name="check" size={12} color={colors.onBrandPrimary} /> : null}</View>
      </View>
      <Text style={[s.bodyMuted, { marginTop: 5 }]}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  optionRow: { flexDirection: "row", gap: spacing.md },
  option: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  optionActive: { borderColor: colors.brandPrimary, borderWidth: 2, backgroundColor: colors.brandTertiary },
  optionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  optionTitle: { color: colors.onSurface, fontFamily: fonts.text, fontWeight: "700", fontSize: 15, flexShrink: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  coverList: { gap: spacing.md },
  coverCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  coverCardActive: { borderColor: colors.brandPrimary, borderWidth: 2 },
  coverImage: { width: 120, height: 120, alignSelf: "center", backgroundColor: colors.surfaceSecondary },
  selectedText: { color: colors.brandPrimary, fontFamily: fonts.text, fontWeight: "700", marginTop: spacing.sm },
  coverStyle: { color: colors.brandPrimary, fontFamily: fonts.text, fontWeight: "700", fontSize: 10, letterSpacing: 1 },
  error: { color: colors.error, marginTop: spacing.md },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
