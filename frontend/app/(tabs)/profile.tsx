import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api, setToken } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me.data?.customer) {
      setName(me.data.customer.name || "");
      setEmail(me.data.customer.email || "");
    }
  }, [me.data]);

  const save = async () => {
    await api.updateMe({ name, email });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    me.refetch();
  };

  const logout = async () => {
    await setToken(null);
    router.replace("/login");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, padding: spacing.xl }}
    >
      <Text style={s.h1}>Profile</Text>
      <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>+91 {me.data?.customer?.mobile}</Text>

      <Text style={[s.label, { marginTop: spacing.xxl }]}>Name</Text>
      <TextInput
        testID="profile-name-input"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Text style={[s.label, { marginTop: spacing.lg }]}>Email (optional)</Text>
      <TextInput
        testID="profile-email-input"
        value={email}
        onChangeText={setEmail}
        placeholder="you@email.com"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />
      <Button testID="profile-save-button" label={saved ? "Saved ✓" : "Save"} onPress={save} style={{ marginTop: spacing.xl }} />

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xxl }} />
      <Pressable testID="profile-logout" onPress={logout} style={styles.row}>
        <Feather name="log-out" size={20} color={colors.error} />
        <Text style={{ marginLeft: spacing.md, color: colors.error, fontFamily: fonts.text, fontSize: 16 }}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 16,
    fontFamily: fonts.text,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md },
});
