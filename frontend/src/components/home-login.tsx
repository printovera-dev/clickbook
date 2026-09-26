// Inline sign-in block for the home page. Reuses the existing WhatsApp OTP flow (POST /auth/otp/send → /verify).
// When the customer is already signed in it becomes the "Start Making Your ClickBook" CTA.
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

export function HomeLogin({ title, accent, subtitle, loggedIn, testID, compact }: {
  title: string; accent?: string; subtitle?: string; loggedIn: boolean; testID: string; compact?: boolean;
}) {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    const m = mobile.replace(/\D/g, "");
    if (m.length !== 10) { setErr("Enter your 10-digit mobile number"); return; }
    setErr(""); setBusy(true);
    try {
      const r = await api.sendOtp(m, "whatsapp");
      router.push({ pathname: "/verify", params: { mobile: m, provider: r.provider || "mock", devHint: r.dev_hint || "" } });
    } catch (e: any) {
      setErr(e.message || "Could not send passcode");
    } finally { setBusy(false); }
  };

  return (
    <View style={[styles.card, compact && { paddingVertical: spacing.lg }]} testID={testID}>
      <Text style={styles.title}>{title} {accent ? null : <Feather name="heart" size={16} color={colors.homePink} />}</Text>
      {accent ? <Text style={styles.accent}>{accent}</Text> : null}
      {loggedIn ? (
        <Pressable testID={`${testID}-start`} onPress={() => router.push("/create/cover")} style={styles.button}>
          <Text style={styles.buttonText}>Start Making Your ClickBook</Text>
          <Feather name="arrow-right" size={18} color="#FFF" />
        </Pressable>
      ) : (
        <>
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              testID={`${testID}-mobile`}
              value={mobile}
              onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
              keyboardType="number-pad"
              placeholder="Mobile number"
              placeholderTextColor={colors.muted}
              style={styles.input}
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={send}
            />
          </View>
          {err ? <Text style={styles.err} testID={`${testID}-error`}>{err}</Text> : null}
          <Pressable testID={`${testID}-continue`} onPress={send} disabled={busy} style={[styles.button, busy && { opacity: 0.7 }]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Continue</Text>}
          </Pressable>
          <Text style={styles.hint}>We&apos;ll send your passcode on WhatsApp</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.homeCard, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.homeCharcoal, textAlign: "center" },
  accent: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.homePink, textAlign: "center", fontStyle: "italic" },
  sub: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: colors.muted, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginTop: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: spacing.lg, height: 52, backgroundColor: colors.surfaceSecondary },
  prefix: { fontFamily: fonts.text, fontSize: 16, color: colors.homeCharcoal, marginRight: spacing.sm, fontWeight: "600" },
  input: { flex: 1, fontFamily: fonts.text, fontSize: 16, color: colors.homeCharcoal, height: 52 },
  button: { alignSelf: "stretch", marginTop: spacing.md, height: 52, borderRadius: radius.pill, backgroundColor: colors.homeMint, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  buttonText: { color: "#FFF", fontFamily: fonts.text, fontSize: 16, fontWeight: "700" },
  hint: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  err: { fontFamily: fonts.text, fontSize: 13, color: colors.error, marginTop: spacing.sm, alignSelf: "flex-start" },
});
