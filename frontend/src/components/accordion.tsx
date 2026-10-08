// Accessible accordion rows (CMS-driven): "pairs" (label/value), "bullets", or free "text".
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";
import Feather from "@react-native-vector-icons/feather";
import { colors, fonts, radius, spacing } from "@/src/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

export type AccordionRow = { id: string; title: string; type: "pairs" | "bullets" | "text"; items: { label?: string; value: string }[] };

export function Accordion({ rows, testID }: { rows: AccordionRow[]; testID?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!rows?.length) return null;
  const toggle = (id: string) => {
    if (Platform.OS !== "web") LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => (o === id ? null : id));
  };
  return (
    <View style={styles.wrap} testID={testID}>
      {rows.map((r, idx) => {
        const isOpen = open === r.id;
        return (
          <View key={r.id} style={[styles.row, idx > 0 && styles.rowBorder]}>
            <Pressable
              onPress={() => toggle(r.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              aria-expanded={isOpen}
              accessibilityLabel={`${r.title}, ${isOpen ? "collapse" : "expand"}`}
              testID={`${testID}-header-${idx}`}
              style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.title}>{r.title}</Text>
              <View style={[styles.chevron, isOpen && { backgroundColor: colors.homePink }]}>
                <Feather name={isOpen ? "minus" : "plus"} size={16} color={isOpen ? "#FFF" : colors.homeCharcoal} />
              </View>
            </Pressable>
            {isOpen ? (
              <View style={styles.body} testID={`${testID}-body-${idx}`}>
                {r.type === "pairs" ? r.items.map((it, i) => (
                  <View key={i} style={styles.pair}>
                    <Text style={styles.label}>{it.label}</Text>
                    <Text style={styles.value}>{it.value}</Text>
                  </View>
                )) : null}
                {r.type === "bullets" ? r.items.map((it, i) => (
                  <View key={i} style={styles.bullet}>
                    <View style={styles.dot} />
                    <Text style={[styles.value, { flex: 1 }]}>{it.value}</Text>
                  </View>
                )) : null}
                {r.type === "text" ? r.items.map((it, i) => <Text key={i} style={[styles.value, { marginBottom: 6 }]}>{it.value}</Text>) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.homeCard, overflow: "hidden" },
  row: {},
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  title: { flex: 1, fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: colors.homeCharcoal },
  chevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.homeBlueSoft, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 8 },
  pair: { flexDirection: "row", gap: spacing.md, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { width: "38%", fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  value: { flex: 1, fontFamily: fonts.text, fontSize: 14, color: colors.homeCharcoal, lineHeight: 20 },
  bullet: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.homePink, marginTop: 7 },
});
