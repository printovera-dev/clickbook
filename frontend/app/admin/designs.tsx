// Album Designs: the design system customers choose from — album styles (layout rhythm) and cover styles.
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { AdminPage } from "@/src/components/admin-page";
import { ALBUM_STYLES, COVER_STYLES } from "@/src/design";
import { s } from "@/src/ui";
import { colors, fonts, radius, spacing } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminDesigns() {
  const router = useRouter();
  return (
    <AdminPage title="Album Designs" testID="admin-designs">
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
});
