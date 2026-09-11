import { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  Pressable, ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, fonts, spacing, radius } from "@/src/theme";

export default function Login() {
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const send = async () => {
    setErr("");
    if (mobile.replace(/\D/g, "").length < 8) {
      setErr("Please enter a valid mobile number");
      return;
    }
    setLoading(true);
    try {
      const r = await api.sendOtp(mobile, "whatsapp");
      router.push({ pathname: "/verify", params: { mobile, provider: r.provider || "mock", devHint: r.dev_hint || "" } });
    } catch (e: any) {
      setErr(e.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.heroWrap}>
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1676883344224-2fa5de6025db?crop=entropy&cs=srgb&fm=jpg&w=1200&q=85" }}
          style={styles.hero}
          contentFit="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(28,25,23,0.6)", colors.surface]}
          locations={[0, 0.6, 1]}
          style={styles.scrim}
        />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.label}>ClickBook</Text>
          <Text style={[s.displayHero, { marginTop: spacing.sm }]}>Your most beautiful memories,</Text>
          <Text style={[s.displayHero, { fontStyle: "italic", color: colors.brandPrimary }]}>beautifully preserved.</Text>
          <Text style={[s.bodyMuted, { marginTop: spacing.md }]}>
            Sign in with your mobile number. We&apos;ll send a passcode over WhatsApp.
          </Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              testID="login-mobile-input"
              value={mobile}
              onChangeText={setMobile}
              placeholder="Mobile number"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              maxLength={10}
              style={styles.input}
            />
          </View>
          {err ? <Text style={{ color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text }}>{err}</Text> : null}
          <Button testID="login-send-otp-button" label="Continue" onPress={send} loading={loading} style={{ marginTop: spacing.xl }} />
          <Pressable testID="admin-login-link" onPress={() => router.push("/admin/login")} style={{ marginTop: spacing.xl, alignSelf: "center" }}>
            <Text style={[s.bodyMuted, { textDecorationLine: "underline" }]}>Admin login</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  heroWrap: { height: "48%", width: "100%" },
  hero: { width: "100%", height: "100%" },
  scrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  sheet: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.surface,
    marginTop: -spacing.xxl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
  },
  prefix: { fontFamily: fonts.text, color: colors.onSurface, fontSize: 16, marginRight: spacing.sm },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, fontFamily: fonts.text, color: colors.onSurface },
});
