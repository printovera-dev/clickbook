// Promotional offer popup — content and code resolved server-side from the configured offer (GET /api/home → promo).
// Shown once per session when enabled in Admin → Home Page CMS → Promo popup.
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import Feather from "@react-native-vector-icons/feather";
import { colors, fonts, radius, spacing } from "@/src/theme";

export type Promo = { title: string; text: string; button_label: string; code: string; discount: string; min_order?: number; end_at?: string | null };

let shownThisSession = false;

export function PromoPopup({ promo }: { promo?: Promo | null }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (!promo || shownThisSession) return;
    const t = setTimeout(() => { shownThisSession = true; setVisible(true); }, 1600);
    return () => clearTimeout(t);
  }, [promo]);

  if (!promo) return null;
  const copy = async () => {
    try { await Clipboard.setStringAsync(promo.code); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const ends = promo.end_at ? new Date(promo.end_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)} testID="promo-backdrop">
        <Pressable style={[styles.card, { width: Math.min(width - spacing.xl * 2, 420) }]} onPress={() => {}} testID="promo-popup">
          <Pressable onPress={() => setVisible(false)} hitSlop={10} style={styles.close} testID="promo-close"><Feather name="x" size={18} color={colors.muted} /></Pressable>
          <View style={styles.tag}><Feather name="gift" size={14} color="#FFF" /><Text style={styles.tagTxt}>{promo.discount}</Text></View>
          <Text style={styles.title}>{promo.title}</Text>
          {promo.text ? <Text style={styles.text}>{promo.text}</Text> : null}
          <View style={styles.codeRow}>
            <Text style={styles.code} testID="promo-code" selectable>{promo.code}</Text>
            <Pressable onPress={copy} style={[styles.copyBtn, copied && { backgroundColor: colors.homeBlue }]} accessibilityRole="button" testID="promo-copy">
              <Feather name={copied ? "check" : "copy"} size={15} color="#FFF" />
              <Text style={styles.copyTxt}>{copied ? "Copied!" : promo.button_label || "Copy code"}</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>
            {promo.min_order ? `On orders above ₹${promo.min_order}. ` : ""}{ends ? `Valid till ${ends}. ` : ""}Apply at checkout.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(43,43,46,0.55)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: colors.homeCard, borderRadius: 24, padding: spacing.xl, paddingTop: spacing.xxl, alignItems: "center", gap: spacing.sm },
  close: { position: "absolute", top: 12, right: 12, width: 36, height: 36, alignItems: "center", justifyContent: "center", zIndex: 2 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.homePink, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  tagTxt: { color: "#FFF", fontFamily: fonts.text, fontWeight: "700", fontSize: 13 },
  title: { fontFamily: fonts.text, fontSize: 22, fontWeight: "800", color: colors.homeCharcoal, textAlign: "center", marginTop: spacing.sm },
  text: { fontFamily: fonts.text, fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.homeBlue, borderRadius: radius.md, paddingLeft: spacing.lg, paddingRight: 6, paddingVertical: 6 },
  code: { fontFamily: fonts.text, fontSize: 18, fontWeight: "800", letterSpacing: 2, color: colors.homeCharcoal },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.homeCharcoal, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.sm },
  copyTxt: { color: "#FFF", fontFamily: fonts.text, fontWeight: "700", fontSize: 13 },
  meta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.sm },
});
