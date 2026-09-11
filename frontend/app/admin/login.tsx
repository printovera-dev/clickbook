import { useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, setAdminToken } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

export default function AdminLogin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const login = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await api.adminLogin(username, password);
      await setAdminToken(res.token);
      router.replace("/admin/dashboard");
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xxl }} style={{ backgroundColor: colors.surface }}>
      <Pressable onPress={() => router.back()} testID="admin-login-back"><Text style={{ color: colors.brandPrimary, fontFamily: fonts.text }}>← Back</Text></Pressable>
      <Text style={[s.h1, { marginTop: spacing.xl }]}>Admin sign in</Text>
      <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Only ClickBook staff can access the admin console.</Text>
      <Text style={[s.label, { marginTop: spacing.xl }]}>Username</Text>
      <TextInput testID="admin-username-input" value={username} onChangeText={setUsername} autoCapitalize="none" placeholderTextColor={colors.muted} style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>Password</Text>
      <TextInput testID="admin-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.muted} style={styles.input} />
      {err ? <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text> : null}
      <Button testID="admin-login-button" label="Sign in" onPress={login} loading={loading} style={{ marginTop: spacing.xl }} />
      <Text style={[s.bodyMuted, { marginTop: spacing.xxl, textAlign: "center" }]}>Demo: admin / clickbook@2026</Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
});
