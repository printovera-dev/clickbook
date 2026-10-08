import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function AdminPricing() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });
  const [pricePerSheet, setPricePerSheet] = useState("");
  const [gst, setGst] = useState("");
  const [minSheets, setMinSheets] = useState("");
  const [maxSheets, setMaxSheets] = useState("");
  const [giftWrapFee, setGiftWrapFee] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [saved, setSaved] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const changePw = async () => {
    setPwMsg("");
    try { await api.adminChangePassword(curPw, newPw); setPwMsg("Password updated ✓"); setCurPw(""); setNewPw(""); }
    catch (e: any) { setPwMsg(e.message || "Could not change password"); }
  };

  useEffect(() => {
    if (q.data?.settings) {
      setPricePerSheet(String(q.data.settings.price_per_sheet));
      setGst(String(q.data.settings.gst_percent));
      setMinSheets(String(q.data.settings.min_sheets));
      setMaxSheets(String(q.data.settings.max_sheets));
      setGiftWrapFee(String(q.data.settings.gift_wrap_fee ?? 150));
      setWhatsapp(String(q.data.settings.support_whatsapp ?? ""));
    }
  }, [q.data]);

  const save = async () => {
    await api.adminUpdateSettings({
      price_per_sheet: Number(pricePerSheet),
      gst_percent: Number(gst),
      min_sheets: Number(minSheets),
      max_sheets: Number(maxSheets),
      gift_wrap_fee: Number(giftWrapFee),
      support_whatsapp: whatsapp.replace(/\D/g, "") || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    q.refetch();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => router.back()} testID="admin-pricing-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={[s.h1, { marginTop: spacing.xl }]}>Pricing rules</Text>
      <Text style={[s.bodyMuted, { marginTop: 4 }]}>Applies to all new orders.</Text>

      <Text style={[s.label, { marginTop: spacing.xl }]}>Price per sheet (₹)</Text>
      <TextInput testID="pricing-per-sheet" value={pricePerSheet} onChangeText={setPricePerSheet} keyboardType="numeric" style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>GST %</Text>
      <TextInput testID="pricing-gst" value={gst} onChangeText={setGst} keyboardType="numeric" style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>Min sheets</Text>
      <TextInput testID="pricing-min" value={minSheets} onChangeText={setMinSheets} keyboardType="numeric" style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>Max sheets</Text>
      <TextInput testID="pricing-max" value={maxSheets} onChangeText={setMaxSheets} keyboardType="numeric" style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>Gift wrap add-on fee (₹)</Text>
      <TextInput testID="pricing-gift-wrap" value={giftWrapFee} onChangeText={setGiftWrapFee} keyboardType="numeric" style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>Support WhatsApp number</Text>
      <TextInput testID="settings-whatsapp" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="10-digit number" placeholderTextColor={colors.muted} style={styles.input} />

      <Button testID="pricing-save" label={saved ? "Saved ✓" : "Save"} onPress={save} style={{ marginTop: spacing.xl }} />

      <Text style={[s.h1, { marginTop: spacing.xxl }]}>Admin password</Text>
      <Text style={[s.bodyMuted, { marginTop: 4 }]}>Credentials are stored hashed on the server. Minimum 8 characters.</Text>
      <Text style={[s.label, { marginTop: spacing.xl }]}>Current password</Text>
      <TextInput testID="settings-current-password" value={curPw} onChangeText={setCurPw} secureTextEntry style={styles.input} />
      <Text style={[s.label, { marginTop: spacing.md }]}>New password</Text>
      <TextInput testID="settings-new-password" value={newPw} onChangeText={setNewPw} secureTextEntry style={styles.input} />
      {pwMsg ? <Text style={{ marginTop: spacing.sm, fontFamily: fonts.text, color: pwMsg.startsWith("Password") ? colors.onSurface : colors.error }}>{pwMsg}</Text> : null}
      <Button testID="settings-change-password" label="Change password" variant="outline" onPress={changePw} style={{ marginTop: spacing.md, marginBottom: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: 16 },
});
