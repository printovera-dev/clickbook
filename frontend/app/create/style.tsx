import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { ALBUM_STYLES, StyleKey } from "@/src/design";

export default function ChooseStyle() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [style, setStyle] = useState<StyleKey | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="style-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Choose Style</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}>
        <Text style={s.h1}>Choose your album style</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>Choose how you want your photos arranged. You can fine-tune everything later.</Text>
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {ALBUM_STYLES.map((st) => {
            const active = style === st.key;
            return (
              <Pressable key={st.key} testID={`style-${st.key}`} onPress={() => setStyle(st.key)} style={[styles.card, active && styles.cardActive]}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {st.rhythm.map((n, i) => <MiniPage key={i} n={n} active={active} />)}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md }}>
                  <Text style={[s.h2, active && { color: colors.brandPrimary }]}>{st.name}</Text>
                  <View style={[styles.radio, active && styles.radioActive]}>{active ? <Feather name="check" size={14} color={colors.onBrandPrimary} /> : null}</View>
                </View>
                <Text style={[s.bodyMuted, { marginTop: 4 }]}>{st.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          testID="style-continue-button"
          label="Design my album"
          disabled={!style}
          onPress={() => router.replace({ pathname: "/create/generating", params: { albumId: String(albumId), style: String(style) } })}
        />
      </View>
    </View>
  );
}

function MiniPage({ n, active }: { n: number; active: boolean }) {
  const c = active ? colors.brandSecondary : colors.borderStrong;
  const blocks = n === 1 ? [{ l: 8, t: 8, w: 84, h: 84 }]
    : n === 2 ? [{ l: 8, t: 8, w: 84, h: 40 }, { l: 8, t: 52, w: 84, h: 40 }]
    : n === 3 ? [{ l: 8, t: 8, w: 84, h: 50 }, { l: 8, t: 62, w: 40, h: 30 }, { l: 52, t: 62, w: 40, h: 30 }]
    : [{ l: 8, t: 8, w: 40, h: 40 }, { l: 52, t: 8, w: 40, h: 40 }, { l: 8, t: 52, w: 40, h: 40 }, { l: 52, t: 52, w: 40, h: 40 }];
  return (
    <View style={{ width: 56, height: 56, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 3 }}>
      {blocks.map((b, i) => <View key={i} style={{ position: "absolute", left: b.l * 0.56, top: b.t * 0.56, width: b.w * 0.56, height: b.h * 0.56, backgroundColor: c, borderRadius: 1 }} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary },
  cardActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  radioActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
