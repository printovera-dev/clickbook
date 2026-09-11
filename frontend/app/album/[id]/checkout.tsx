import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";
import Feather from "@react-native-vector-icons/feather";

export default function Checkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const albumQ = useQuery({ queryKey: ["album", id], queryFn: () => api.getAlbum(String(id)), enabled: !!id });
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const album = albumQ.data?.album;
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponErr, setCouponErr] = useState("");
  const [giftWrap, setGiftWrap] = useState(false);
  const [price, setPrice] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (album?.sheets) {
      api.calculatePrice(album.sheets, appliedCoupon || undefined, giftWrap).then(setPrice).catch(() => {});
    }
  }, [album?.sheets, appliedCoupon, giftWrap]);

  useEffect(() => {
    if (meQ.data?.customer) {
      setName(meQ.data.customer.name || "");
      setEmail(meQ.data.customer.email || "");
    }
  }, [meQ.data]);

  const applyCoupon = async () => {
    setCouponErr("");
    if (!coupon.trim() || !album?.sheets) return;
    const res = await api.calculatePrice(album.sheets, coupon.trim(), giftWrap);
    if (res.coupon_error) {
      setCouponErr(res.coupon_error);
    } else {
      setAppliedCoupon(coupon.trim().toUpperCase());
      setPrice(res);
    }
  };

  const placeOrder = async () => {
    setErr("");
    if (!name || !line1 || !city || !state || !pin) {
      setErr("Please fill your name and address");
      return;
    }
    setBusy(true);
    try {
      const { order } = await api.createOrder({
        album_id: String(id),
        coupon_code: appliedCoupon,
        gift_wrap: giftWrap,
        address: { name, email, line1, city, state, pin },
      });
      await api.updateMe({ name, email });
      await api.payOrder(order.id);
      router.replace({ pathname: "/order/[id]", params: { id: order.id, celebrate: "1" } });
    } catch (e: any) {
      setErr(e.message || "Order failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="checkout-back"><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>Checkout</Text>
        <View style={{ width: 22 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 }}>
          <Text style={s.h1}>Your order</Text>

          <View style={styles.card}>
            <View style={styles.row}><Text style={s.body}>ClickBook 8 × 8″</Text><Text style={s.body}>₹{price?.subtotal ?? "…"}</Text></View>
            <View style={styles.row}><Text style={s.bodyMuted}>{album?.sheets} sheets × ₹{price?.price_per_sheet}</Text><View /></View>
            {price?.discount ? (
              <View style={styles.row}><Text style={{ color: colors.success, fontFamily: fonts.text }}>Discount ({appliedCoupon})</Text><Text style={{ color: colors.success, fontFamily: fonts.text }}>−₹{price.discount}</Text></View>
            ) : null}
            {giftWrap && price?.gift_wrap_fee ? (
              <View style={styles.row}><Text style={s.body}>Gift wrap</Text><Text style={s.body}>₹{price.gift_wrap_fee}</Text></View>
            ) : null}
            <View style={styles.row}><Text style={s.bodyMuted}>GST {price?.gst_percent}%</Text><Text style={s.bodyMuted}>₹{price?.gst}</Text></View>
            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm }]}>
              <Text style={s.h2}>Total</Text>
              <Text style={s.h2}>₹{price?.total ?? "…"}</Text>
            </View>
          </View>

          <Pressable testID="checkout-gift-wrap-toggle" onPress={() => setGiftWrap(!giftWrap)} style={[styles.giftCard, giftWrap && styles.giftCardActive]}>
            <Feather name="gift" size={22} color={giftWrap ? colors.onBrandPrimary : colors.brandPrimary} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={{ fontFamily: fonts.text, fontWeight: "500", fontSize: 15, color: giftWrap ? colors.onBrandPrimary : colors.onSurface }}>Gift wrap it</Text>
              <Text style={{ fontFamily: fonts.text, fontSize: 13, color: giftWrap ? colors.onBrandPrimary : colors.muted }}>Ribbon + handwritten note, ready to gift.</Text>
            </View>
            <View style={[styles.checkbox, giftWrap && { backgroundColor: colors.onBrandPrimary, borderColor: colors.onBrandPrimary }]}>
              {giftWrap && <Feather name="check" size={14} color={colors.brandPrimary} />}
            </View>
          </Pressable>

          <Text style={[s.label, { marginTop: spacing.xxl }]}>Have a coupon?</Text>
          <View style={styles.couponRow}>
            <TextInput testID="checkout-coupon-input" value={coupon} onChangeText={setCoupon} placeholder="e.g. WELCOME2026" placeholderTextColor={colors.muted} autoCapitalize="characters" style={styles.couponInput} />
            <Pressable testID="checkout-coupon-apply" onPress={applyCoupon} style={styles.applyBtn}><Text style={{ color: colors.brandPrimary, fontFamily: fonts.text, fontWeight: "500" }}>Apply</Text></Pressable>
          </View>
          {appliedCoupon ? <Text style={{ color: colors.success, marginTop: 6, fontFamily: fonts.text }}>✓ {appliedCoupon} applied</Text> : null}
          {couponErr ? <Text style={{ color: colors.error, marginTop: 6 }}>{couponErr}</Text> : null}

          <Text style={[s.label, { marginTop: spacing.xxl }]}>Delivery details</Text>
          <TextInput testID="checkout-name-input" value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} />
          <TextInput testID="checkout-email-input" value={email} onChangeText={setEmail} placeholder="Email (optional)" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          <TextInput testID="checkout-line1-input" value={line1} onChangeText={setLine1} placeholder="Address" placeholderTextColor={colors.muted} style={styles.input} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <TextInput testID="checkout-city-input" value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
            <TextInput testID="checkout-state-input" value={state} onChangeText={setState} placeholder="State" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} />
          </View>
          <TextInput testID="checkout-pin-input" value={pin} onChangeText={setPin} placeholder="PIN code" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={6} style={styles.input} />

          {err ? <Text style={{ color: colors.error, marginTop: spacing.md }}>{err}</Text> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="checkout-pay-button" label={busy ? "Processing..." : `Pay ₹${price?.total ?? "…"} (Mock)`} onPress={placeOrder} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  card: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, padding: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 15, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  couponRow: { flexDirection: "row", marginTop: spacing.sm, gap: spacing.md },
  couponInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, letterSpacing: 1 },
  applyBtn: { justifyContent: "center", paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.md },
  giftCard: { flexDirection: "row", alignItems: "center", marginTop: spacing.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  giftCardActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
