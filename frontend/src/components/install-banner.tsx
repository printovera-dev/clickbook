// Web-only "Install ClickBook" banner. Chrome/Android: driven by `beforeinstallprompt` (captured in +html.tsx).
// iOS Safari has no install event, so we show a short "Share → Add to Home Screen" hint instead.
// Renders nothing on native and when already running standalone.
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import Feather from "@react-native-vector-icons/feather";
import { colors, fonts, radius, spacing } from "@/src/theme";

const DISMISS_KEY = "clickbook.installDismissed";

export function InstallBanner() {
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const w = window as any;
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    if (standalone || localStorage.getItem(DISMISS_KEY)) return;
    const show = () => setMode("prompt");
    if (w.__clickbookInstallPrompt) show();
    window.addEventListener("clickbook:installable", show);
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
    const t = isIOS ? setTimeout(() => setMode((m) => (m === "hidden" ? "ios" : m)), 2500) : null;
    return () => { window.removeEventListener("clickbook:installable", show); if (t) clearTimeout(t); };
  }, []);

  if (Platform.OS !== "web" || mode === "hidden") return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setMode("hidden"); };
  const install = async () => {
    const p = (window as any).__clickbookInstallPrompt;
    if (!p) return dismiss();
    p.prompt();
    const choice = await p.userChoice.catch(() => null);
    (window as any).__clickbookInstallPrompt = null;
    if (choice?.outcome === "accepted") setMode("hidden"); else dismiss();
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="pwa-install-banner">
      <View style={styles.card}>
        <Image source={{ uri: "/icons/icon-192.png" }} style={styles.icon} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Install ClickBook</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {mode === "ios" ? "Tap Share, then “Add to Home Screen” for the full-screen app." : "Add to your Home Screen for a faster, full-screen experience."}
          </Text>
        </View>
        {mode === "prompt" ? (
          <Pressable onPress={install} style={styles.btn} testID="pwa-install-button"><Text style={styles.btnTxt}>Install</Text></Pressable>
        ) : (
          <Feather name="share" size={20} color={colors.homeBlue} />
        )}
        <Pressable onPress={dismiss} hitSlop={10} style={styles.close} testID="pwa-install-dismiss"><Feather name="x" size={18} color={colors.muted} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 72, alignItems: "center", paddingHorizontal: spacing.lg, zIndex: 200 },
  card: { width: "100%", maxWidth: 520, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.homeCard, borderWidth: 1, borderColor: colors.border, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" } as any,
  icon: { width: 44, height: 44, borderRadius: 10 },
  title: { fontFamily: fonts.text, fontWeight: "700", fontSize: 14, color: colors.homeCharcoal },
  sub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  btn: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.homePink, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#FFF", fontFamily: fonts.text, fontWeight: "700", fontSize: 13 },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
