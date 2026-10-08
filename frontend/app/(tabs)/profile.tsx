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
  const [gst, setGst] = useState("");
  const [addr, setAddr] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const setA = (k: string, v: string) => setAddr((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    if (me.data?.customer) {
      const c = me.data.customer;
      setName(c.name || "");
      setEmail(c.email || "");
      setGst(c.gst_no || "");
      setAddr({ name: "", line1: "", line2: "", city: "", state: "", pincode: "", phone: "", ...(c.address || {}) });
    }
  }, [me.data]);

  const save = async () => {
    setErr("");
    const g = gst.trim().toUpperCase();
    if (g && !/^[0-9]{2}[A-Z0-9]{13}$/.test(g)) { setErr("GST number should be 15 characters (e.g. 27ABCDE1234F1Z5)"); return; }
    const hasAddr = Object.values(addr).some((v) => (v || "").trim());
    if (hasAddr && (!addr.line1?.trim() || !addr.city?.trim() || !/^\d{6}$/.test(addr.pincode || ""))) { setErr("Address needs at least a street, city and a 6-digit pincode"); return; }
    await api.updateMe({ name, email, gst_no: g, address: hasAddr ? addr : undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    me.refetch();
  };

  const logout = async () => {
    await setToken(null);
    router.replace("/(tabs)/home");
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
      <Text style={[s.label, { marginTop: spacing.lg }]}>GST number (optional)</Text>
      <TextInput testID="profile-gst-input" value={gst} onChangeText={setGst} placeholder="15-character GSTIN for business invoices" placeholderTextColor={colors.muted} autoCapitalize="characters" maxLength={15} style={styles.input} />

      <Text style={[s.label, { marginTop: spacing.xl }]}>Delivery address</Text>
      {me.data?.customer?.address_from_order ? <Text style={[s.bodyMuted, { marginTop: 4 }]} testID="profile-address-from-order">Pre-filled from your last order — edit and save to update.</Text> : <Text style={[s.bodyMuted, { marginTop: 4 }]}>Used to pre-fill checkout.</Text>}
      <TextInput testID="profile-addr-name" value={addr.name || ""} onChangeText={(v) => setA("name", v)} placeholder="Receiver name" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput testID="profile-addr-line1" value={addr.line1 || ""} onChangeText={(v) => setA("line1", v)} placeholder="House / flat, street" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput testID="profile-addr-line2" value={addr.line2 || ""} onChangeText={(v) => setA("line2", v)} placeholder="Area, landmark (optional)" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TextInput testID="profile-addr-city" value={addr.city || ""} onChangeText={(v) => setA("city", v)} placeholder="City" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
        <TextInput testID="profile-addr-state" value={addr.state || ""} onChangeText={(v) => setA("state", v)} placeholder="State" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <TextInput testID="profile-addr-pincode" value={addr.pincode || ""} onChangeText={(v) => setA("pincode", v.replace(/\D/g, "").slice(0, 6))} placeholder="Pincode" keyboardType="number-pad" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
        <TextInput testID="profile-addr-phone" value={addr.phone || ""} onChangeText={(v) => setA("phone", v.replace(/\D/g, "").slice(0, 10))} placeholder="Phone" keyboardType="phone-pad" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
      </View>
      {err ? <Text style={{ color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text }} testID="profile-error">{err}</Text> : null}
      <Button testID="profile-save-button" label={saved ? "Saved ✓" : "Save"} onPress={save} style={{ marginTop: spacing.xl }} />

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xxl }} />
      <Text style={s.label}>My ClickBooks</Text>
      <Pressable testID="profile-my-books" onPress={() => router.push("/(tabs)/albums")} style={[styles.row, { marginTop: spacing.sm }]}>
        <Text style={s.body}>Drafts &amp; ordered albums</Text>
      </Pressable>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xxl }} />
      <Text style={s.label}>Legal</Text>
      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {[
          { key: "faq", label: "FAQ" },
          { key: "privacy", label: "Privacy Policy" },
          { key: "terms", label: "Terms & Conditions" },
          { key: "refund", label: "Refund & Cancellation" },
          { key: "shipping", label: "Shipping & Delivery" },
        ].map((p) => (
          <Pressable
            key={p.key}
            testID={`profile-policy-${p.key}`}
            onPress={() => router.push({ pathname: "/policy/[key]", params: { key: p.key } })}
            style={styles.legalRow}
          >
            <Feather name="file-text" size={18} color={colors.brandPrimary} />
            <Text style={{ marginLeft: spacing.md, flex: 1, fontFamily: fonts.text, color: colors.onSurface }}>{p.label}</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>

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
  legalRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
});
