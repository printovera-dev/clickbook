import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, setToken } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, fonts, spacing, radius } from "@/src/theme";

export default function Verify() {
  const { mobile } = useLocalSearchParams<{ mobile: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const verify = async () => {
    setErr("");
    if (otp.length < 4) return setErr("Enter the 6-digit code");
    setLoading(true);
    try {
      const res = await api.verifyOtp(String(mobile), otp);
      await setToken(res.token);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try { await api.sendOtp(String(mobile), "whatsapp"); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
          <Pressable onPress={() => router.back()} testID="verify-back">
            <Text style={{ color: colors.brandPrimary, fontFamily: fonts.text }}>← Back</Text>
          </Pressable>
          <Text style={[s.h1, { marginTop: spacing.xl }]}>Enter your passcode</Text>
          <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>
            Sent a 6-digit code to +91 {mobile}. Use <Text style={{ color: colors.brandPrimary }}>123456</Text> (demo).
          </Text>
          <TextInput
            testID="verify-otp-input"
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.otpInput}
          />
          {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text> : null}
          <Button testID="verify-otp-button" label="Verify & Continue" onPress={verify} loading={loading} style={{ marginTop: spacing.xl }} />
          <Pressable onPress={resend} style={{ marginTop: spacing.xl, alignSelf: "center" }} testID="verify-resend">
            <Text style={[s.bodyMuted, { textDecorationLine: "underline" }]}>Resend passcode</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  otpInput: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    fontFamily: fonts.text,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
});
