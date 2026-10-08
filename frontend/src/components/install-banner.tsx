// Web-only "Install ClickBook" banner with platform-specific flows:
//  • Android / desktop Chrome & Edge: `beforeinstallprompt` (captured in public/index.html) → native Install dialog.
//  • iPhone / iPad: Apple has no install event. Safari → Share → "Add to Home Screen" instructions; other iOS
//    browsers (Chrome/Firefox/Edge on iOS) are told to open the site in Safari first.
//  • macOS Safari 17+: File → Add to Dock hint.
// Nothing renders on native, or when already running standalone (navigator.standalone / display-mode: standalone).
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Image } from "expo-image";
import Feather from "@react-native-vector-icons/feather";
import { colors, fonts, radius, spacing } from "@/src/theme";

const DISMISS_KEY = "clickbook.installDismissed";
const INSTALLED_KEY = "clickbook.installedOnce";
type Mode = "hidden" | "prompt" | "ios-safari" | "ios-other" | "mac-safari";

export function detectInstallTarget(): Exclude<Mode, "hidden" | "prompt"> | "other" {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1; // iPadOS reports a Mac UA
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || iPadOS;
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Edg\//i.test(ua);
  if (isIOS) return isSafari ? "ios-safari" : "ios-other";
  if (/Macintosh/i.test(ua) && isSafari) return "mac-safari";
  return "other";
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function InstallBanner() {
  const [mode, setMode] = useState<Mode>("hidden");

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const w = window as any;
    if (isStandalone()) { localStorage.setItem(INSTALLED_KEY, "1"); return; }
    // Launched in a browser after the app had been installed → the user removed it; offer to add it again.
    if (localStorage.getItem(INSTALLED_KEY)) { localStorage.removeItem(INSTALLED_KEY); localStorage.removeItem(DISMISS_KEY); }
    // When launched from the Home Screen we never nag; if the user dismissed us, stay quiet for 7 days.
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 3600 * 1000) return;
    const target = detectInstallTarget();
    if (target === "ios-safari" || target === "ios-other" || target === "mac-safari") {
      const t = setTimeout(() => setMode(target), 2000);
      return () => clearTimeout(t);
    }
    // Android / Chromium: only once the browser says the app is installable (unchanged behaviour).
    const show = () => setMode("prompt");
    if (w.__clickbookInstallPrompt) show();
    window.addEventListener("clickbook:installable", show);
    return () => window.removeEventListener("clickbook:installable", show);
  }, []);

  if (Platform.OS !== "web" || mode === "hidden") return null;

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, String(Date.now())); setMode("hidden"); };
  const install = async () => {
    const p = (window as any).__clickbookInstallPrompt;
    if (!p) return dismiss();
    p.prompt();
    const choice = await p.userChoice.catch(() => null);
    (window as any).__clickbookInstallPrompt = null;
    if (choice?.outcome === "accepted") setMode("hidden"); else dismiss();
  };

  const ios = mode === "ios-safari" || mode === "ios-other";
  return (
    <View style={styles.wrap} pointerEvents="box-none" testID="pwa-install-banner">
      <View style={styles.card} testID={`pwa-install-${mode}`}>
        <View style={styles.row}>
          <Image source={{ uri: "/icons/icon-192.png" }} style={styles.icon} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Install ClickBook</Text>
            {mode === "prompt" ? <Text style={styles.sub}>Add to your Home Screen for a faster, full-screen experience.</Text> : null}
            {mode === "ios-safari" ? <Text style={styles.sub}>Tap the <Feather name="share" size={13} color={colors.homeBlue} /> Share button in Safari, then choose “Add to Home Screen”.</Text> : null}
            {mode === "ios-other" ? <Text style={styles.sub}>Open clickbook.world in Safari, tap <Feather name="share" size={13} color={colors.homeBlue} /> Share, then “Add to Home Screen”.</Text> : null}
            {mode === "mac-safari" ? <Text style={styles.sub}>In Safari choose File → “Add to Dock” to use ClickBook as an app.</Text> : null}
          </View>
          {mode === "prompt" ? (
            <Pressable onPress={install} style={styles.btn} testID="pwa-install-button"><Text style={styles.btnTxt}>Install</Text></Pressable>
          ) : null}
          <Pressable onPress={dismiss} hitSlop={10} style={styles.close} testID="pwa-install-dismiss"><Feather name="x" size={18} color={colors.muted} /></Pressable>
        </View>
        {ios ? (
          <View style={styles.steps} testID="pwa-ios-steps">
            {[["compass", "Safari"], ["share", "Share"], ["plus-square", "Add to Home Screen"], ["check", "Add"]].map(([ic, lb], i, arr) => (
              <View key={lb} style={styles.step}>
                <Feather name={ic as any} size={14} color={colors.homePink} />
                <Text style={styles.stepTxt}>{lb}</Text>
                {i < arr.length - 1 ? <Feather name="chevron-right" size={12} color={colors.muted} /> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 72, alignItems: "center", paddingHorizontal: spacing.lg, zIndex: 200 },
  card: { width: "100%", maxWidth: 520, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.homeCard, borderWidth: 1, borderColor: colors.border, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" } as any,
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 10 },
  title: { fontFamily: fonts.text, fontWeight: "700", fontSize: 14, color: colors.homeCharcoal },
  sub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  btn: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.homePink, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "#FFF", fontFamily: fonts.text, fontWeight: "700", fontSize: 13 },
  close: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  steps: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  step: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepTxt: { fontFamily: fonts.text, fontSize: 12, color: colors.homeCharcoal, fontWeight: "600" },
});
