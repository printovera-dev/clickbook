import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function PolicyScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["policy", key], queryFn: () => api.getPolicy(String(key)), enabled: !!key });
  const p = q.data?.policy;

  const renderBody = (body: string) => {
    const lines = body.split("\n");
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <View key={i} style={{ height: spacing.sm }} />;
      if (trimmed.startsWith("## ")) return <Text key={i} style={styles.h2}>{trimmed.replace(/^##\s+/, "")}</Text>;
      if (trimmed.startsWith("# ")) return <Text key={i} style={styles.h1}>{trimmed.replace(/^#\s+/, "")}</Text>;
      if (trimmed.startsWith("- ")) return (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bullet}>{formatInline(trimmed.slice(2))}</Text>
        </View>
      );
      return <Text key={i} style={styles.p}>{formatInline(trimmed)}</Text>;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="policy-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Legal</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }}>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : p ? (
          <>
            <Text style={s.h1}>{p.title}</Text>
            <Text style={[s.bodyMuted, { marginTop: 4 }]}>Last updated {p.updated}</Text>
            <View style={{ marginTop: spacing.xl }}>{renderBody(p.body)}</View>
          </>
        ) : <Text style={s.body}>Policy not found.</Text>}
      </ScrollView>
    </View>
  );
}

// Renders **bold** inline as a bold Text span
function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Text key={idx} style={{ fontWeight: "600" as any }}>{part.slice(2, -2)}</Text>;
    }
    return <Text key={idx}>{part}</Text>;
  });
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  h1: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22, fontWeight: "500" as any, marginTop: spacing.xl, marginBottom: spacing.sm },
  h2: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 17, fontWeight: "500" as any, marginTop: spacing.lg, marginBottom: spacing.xs },
  p: { fontFamily: fonts.text, color: colors.onSurface, fontSize: 14, lineHeight: 22, marginBottom: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 4, paddingLeft: 8 },
  bulletDot: { fontFamily: fonts.text, color: colors.brandPrimary, marginRight: 8, fontSize: 14, lineHeight: 22 },
  bullet: { flex: 1, fontFamily: fonts.text, color: colors.onSurface, fontSize: 14, lineHeight: 22 },
});
