import { useEffect, useRef, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, getToken } from "@/src/api";
import { colors, spacing, fonts } from "@/src/theme";

export default function ChooseCover() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        const token = await getToken();
        if (!mounted) return;
        if (!token) {
          router.replace({ pathname: "/(tabs)/home", params: { login: "1", next: "create" } });
          return;
        }
        if (started.current) return;
        started.current = true;
        const result = await api.createAlbum();
        if (mounted) router.replace({ pathname: "/create/upload", params: { albumId: result.album.id } });
      } catch (e: any) {
        if (mounted) {
          started.current = false;
          setError(e?.message || "Could not start your ClickBook. Please try again.");
        }
      }
    };
    void start();
    return () => { mounted = false; };
  }, [router]);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      {error ? (
        <>
          <Text style={styles.title}>Couldn’t start your ClickBook</Text>
          <Text style={styles.message}>{error}</Text>
          <Text accessibilityRole="button" onPress={() => { setError(""); started.current = false; router.replace("/create/cover"); }} style={styles.retry}>Try again</Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.title}>Let’s create your ClickBook</Text>
          <Text style={styles.message}>Preparing your album with Editorial Frame. You can change the cover later.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.xl, fontFamily: fonts.display, fontSize: 24, color: colors.onSurface, textAlign: "center" },
  message: { marginTop: spacing.md, fontFamily: fonts.text, fontSize: 14, lineHeight: 21, color: colors.onSurfaceMuted, textAlign: "center" },
  retry: { marginTop: spacing.xl, padding: spacing.md, color: colors.brandPrimary, fontFamily: fonts.text, fontWeight: "700" },
});
