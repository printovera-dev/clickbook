import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

type AlbumSize = "12x18" | "12x12";
type PaperFinish = "gloss" | "matte";
type CoverMaterial = "digital" | "acrylic";

function OptionCard({ title, subtitle, selected, onPress, testID }: {
  title: string; subtitle: string; selected: boolean; onPress: () => void; testID: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ selected }}
      onPress={onPress} style={[styles.option, selected && styles.optionSelected]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.h2}>{title}</Text>
        <Text style={s.bodyMuted}>{subtitle}</Text>
      </View>
      <Feather name={selected ? "check-circle" : "circle"} size={21}
        color={selected ? colors.brandPrimary : colors.muted} />
    </Pressable>
  );
}

export default function WeddingAlbumSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<AlbumSize>("12x18");
  const [paperFinish, setPaperFinish] = useState<PaperFinish>("gloss");
  const [coverMaterial, setCoverMaterial] = useState<CoverMaterial>("digital");

  const next = () => router.push({
    pathname: "/create/cover",
    params: { project: "wedding", size, paperFinish, coverMaterial },
  } as any);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} testID="wedding-setup-back">
          <Feather name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={s.label}>WEDDING ALBUM · STEP 1</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={s.h1}>Create your Wedding Album</Text>
        <Text style={[s.bodyMuted, { marginTop: spacing.sm, marginBottom: spacing.xl }]}>
          Choose your print size, paper finish and cover material. Your existing ClickBook flow stays separate.
        </Text>

        <Text style={s.label}>1. ALBUM SIZE</Text>
        <View style={styles.group}>
          <OptionCard testID="wedding-size-12x18" title="12 × 18 inches" subtitle="Landscape wedding album"
            selected={size === "12x18"} onPress={() => setSize("12x18")} />
          <OptionCard testID="wedding-size-12x12" title="24 × 24 inches" subtitle="Large square album"
            selected={size === "12x12"} onPress={() => setSize("12x12")} />
        </View>

        <Text style={[s.label, { marginTop: spacing.xl }]}>2. PAPER FINISH</Text>
        <View style={styles.group}>
          <OptionCard testID="wedding-finish-gloss" title="Gloss" subtitle="Shiny finish with stronger reflections"
            selected={paperFinish === "gloss"} onPress={() => setPaperFinish("gloss")} />
          <OptionCard testID="wedding-finish-matte" title="Matte" subtitle="Soft, low-reflection finish"
            selected={paperFinish === "matte"} onPress={() => setPaperFinish("matte")} />
        </View>

        <Text style={[s.label, { marginTop: spacing.xl }]}>3. COVER MATERIAL</Text>
        <View style={styles.group}>
          <OptionCard testID="wedding-material-digital" title="Digital cover" subtitle="Printed cover artwork"
            selected={coverMaterial === "digital"} onPress={() => setCoverMaterial("digital")} />
          <OptionCard testID="wedding-material-acrylic" title="Acrylic cover" subtitle="Acrylic-style finish shown in the 3D preview"
            selected={coverMaterial === "acrylic"} onPress={() => setCoverMaterial("acrylic")} />
        </View>
        <Text style={[s.bodyMuted, { marginTop: spacing.lg }]}>
          Next, you will choose from the available cover designs. The acrylic look is a preview effect; it will not be baked into your print artwork.
        </Text>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button testID="wedding-setup-continue" label="Continue to cover designs" onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: 150, width: "100%", maxWidth: 720, alignSelf: "center" },
  group: { gap: spacing.sm, marginTop: spacing.md },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  optionSelected: { borderColor: colors.brandPrimary, borderWidth: 2 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
