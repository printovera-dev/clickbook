import { useEffect, useRef, useState } from "react";
import { View, Modal, ActivityIndicator, Text, Pressable, StyleSheet, Platform } from "react-native";
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
  const [verifying, setVerifying] = useState(false);
  const rzRef = useRef<any>(null);

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
      if (r.provider === "mock") {
        // No Razorpay keys yet — simulate success and mark paid via /orders/pay for demo continuity.
        await api.payOrder(clickbookOrderId);
        onSuccess(`MOCK_${r.razorpay_order_id}`);
      } else if (Platform.OS === "web") {
        await openWeb(r);
      }
    } catch (e: any) {
      onError(e.message || "Could not start payment");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      start();
    } else {
      setRpOrderId(null);
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

  const checkoutUrl = rpOrderId ? `${BASE}/api/payments/razorpay/checkout/${rpOrderId}` : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.topbar}>
          <Pressable testID="razorpay-close" onPress={onClose}>
            <Feather name="x" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={{ fontFamily: fonts.text, color: colors.onSurface, fontSize: 14 }}>Secure Checkout</Text>
          <View style={{ width: 22 }} />
        </View>
        {loading || verifying || provider === "mock" || Platform.OS === "web" ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text style={{ marginTop: spacing.md, fontFamily: fonts.text, color: colors.onSurfaceTertiary }}>
              {verifying ? "Verifying payment..." : provider === "mock" ? "Processing test payment..." : Platform.OS === "web" && rpOrderId ? "Complete your payment in the Razorpay window" : "Loading Razorpay..."}
            </Text>
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
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
});
