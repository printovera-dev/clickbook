import { useEffect, useRef, useState } from "react";
import { View, Modal, ActivityIndicator, Text, Pressable, StyleSheet, Platform, Linking } from "react-native";
import { WebView } from "react-native-webview";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { colors, spacing, fonts } from "@/src/theme";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const RZP_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RzpPayload = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

// Web: react-native-webview has no browser implementation, so load Razorpay Standard Checkout directly.
function loadRazorpayWeb(): Promise<any> {
  const w = window as any;
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = RZP_SCRIPT;
    s.onload = () => resolve(w.Razorpay);
    s.onerror = () => reject(new Error("Could not load Razorpay"));
    document.body.appendChild(s);
  });
}

type Props = {
  visible: boolean;
  clickbookOrderId: string;
  onClose: () => void;
  onSuccess: (payment_id: string) => void;
  onError: (msg: string) => void;
};

export function RazorpayCheckout({ visible, clickbookOrderId, onClose, onSuccess, onError }: Props) {
  const [rpOrderId, setRpOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<"mock" | "razorpay">("mock");
  const [checkout, setCheckout] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const rzRef = useRef<any>(null);
  const startAttemptRef = useRef(false);

  const handleSuccess = async (p: RzpPayload) => {
    setVerifying(true);
    try {
      await api.verifyRazorpay(p);
      onSuccess(p.razorpay_payment_id);
    } catch (e: any) {
      onError(e.message || "Payment verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const openWeb = async (r: { key_id: string; amount: number; razorpay_order_id: string }) => {
    const Razorpay = await loadRazorpayWeb();
    const rz = new Razorpay({
      key: r.key_id,
      amount: r.amount,
      currency: "INR",
      name: "ClickBook",
      description: "ClickBook photo album",
      order_id: r.razorpay_order_id,
      theme: { color: colors.brandPrimary },
      handler: (p: RzpPayload) => handleSuccess(p),
      modal: { ondismiss: onClose },
    });
    rz.on("payment.failed", (e: any) => onError(e?.error?.description || "Payment failed. Please try again."));
    rzRef.current = rz;
    rz.open();
  };

  const start = async () => {
    setLoading(true);
    try {
      const r = await api.createRazorpayOrder(clickbookOrderId);
      setRpOrderId(r.razorpay_order_id);
      setProvider(r.provider);
      setCheckout(r);
      if (r.provider === "mock") {
        // No Razorpay keys yet — simulate success and mark paid via /orders/pay for demo continuity.
        await api.payOrder(clickbookOrderId);
        onSuccess(`MOCK_${r.razorpay_order_id}`);
      }
    } catch (e: any) {
      onError(e.message || "Could not start payment");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && !startAttemptRef.current) {
      startAttemptRef.current = true;
      start();
    } else if (!visible) {
      startAttemptRef.current = false;
      setRpOrderId(null);
      setCheckout(null);
    }
    // Razorpay appends its own iframe to document.body on web; remove it when the modal goes away.
    return () => { rzRef.current?.close?.(); rzRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onMessage = async (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === "success") {
      await handleSuccess(msg.payload);
    } else if (msg.type === "failed") {
      onError(msg.payload?.description || "Payment failed. Please try again.");
    } else if (msg.type === "dismissed") {
      onClose();
    }
  };

  const checkoutBase = BASE || (Platform.OS === "web" ? window.location.origin : "");
  const checkoutUrl = rpOrderId ? `${checkoutBase}/api/payments/razorpay/checkout/${rpOrderId}` : null;
  const sharePaymentViaWhatsApp = async () => {
    if (!checkoutUrl) return;
    const message = `Please complete payment for my ClickBook photo album through secure Razorpay checkout: ${checkoutUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    try {
      if (Platform.OS === "web") window.open(url, "_blank", "noopener,noreferrer");
      else await Linking.openURL(url);
    } catch { onError("Could not open WhatsApp. Please copy the payment link and share it manually."); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.topbar}>
          <Pressable testID="razorpay-close" onPress={onClose}>
            <Feather name="x" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={{ fontFamily: fonts.text, color: colors.onSurface, fontSize: 14 }}>Secure Checkout</Text>
          {provider === "razorpay" && checkoutUrl ? <Pressable accessibilityLabel="Share payment link via WhatsApp" testID="payment-share-whatsapp" onPress={sharePaymentViaWhatsApp} style={styles.shareButton}><Feather name="message-circle" size={18} color={colors.brandPrimary} /></Pressable> : <View style={{ width: 22 }} />}
        </View>
        {loading || verifying || provider === "mock" ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text style={{ marginTop: spacing.md, fontFamily: fonts.text, color: colors.onSurfaceTertiary }}>
              {verifying ? "Verifying payment..." : provider === "mock" ? "Processing test payment..." : Platform.OS === "web" && rpOrderId ? "Complete your payment in the Razorpay window" : "Loading Razorpay..."}
            </Text>
          </View>
        ) : Platform.OS === "web" ? (
          <View style={styles.loadingWrap}>
            <Text style={{ fontFamily: fonts.text, color: colors.onSurface, textAlign: "center" }}>Your secure Razorpay checkout is ready.</Text>
            <Pressable testID="razorpay-continue-web" onPress={() => checkout && openWeb(checkout)} style={styles.actionButton}><Text style={styles.actionText}>Continue to secure payment</Text></Pressable>
            <Pressable testID="razorpay-share-whatsapp" onPress={sharePaymentViaWhatsApp} style={[styles.actionButton, styles.secondaryButton]}><Text style={[styles.actionText, { color: colors.brandPrimary }]}>Share payment link via WhatsApp</Text></Pressable>
          </View>
        ) : checkoutUrl ? (
          <WebView
            testID="razorpay-webview"
            source={{ uri: checkoutUrl }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => <ActivityIndicator size="large" color={colors.brandPrimary} style={{ flex: 1 }} />}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: spacing.xxl + spacing.md },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  shareButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  actionButton: { width: "100%", maxWidth: 360, alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: 12, backgroundColor: colors.brandPrimary },
  secondaryButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.brandPrimary },
  actionText: { color: colors.onBrandPrimary, fontFamily: fonts.text, fontWeight: "600" },
});
