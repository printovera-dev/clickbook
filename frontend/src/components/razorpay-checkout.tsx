import { useState } from "react";
import { View, Modal, ActivityIndicator, Text, Pressable, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import Feather from "@react-native-vector-icons/feather";
import { api } from "@/src/api";
import { colors, spacing, radius, fonts } from "@/src/theme";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

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
      }
    } catch (e: any) {
      onError(e.message || "Could not start payment");
    } finally {
      setLoading(false);
    }
  };

  useState(() => { if (visible) start(); });
  // trigger start on open
  if (visible && !rpOrderId && !loading) start();

  const onMessage = async (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (msg.type === "success") {
      setVerifying(true);
      try {
        await api.verifyRazorpay({
          razorpay_order_id: msg.payload.razorpay_order_id,
          razorpay_payment_id: msg.payload.razorpay_payment_id,
          razorpay_signature: msg.payload.razorpay_signature,
        });
        onSuccess(msg.payload.razorpay_payment_id);
      } catch (e: any) {
        onError(e.message || "Payment verification failed");
      } finally {
        setVerifying(false);
      }
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
        {loading || verifying || provider === "mock" ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text style={{ marginTop: spacing.md, fontFamily: fonts.text, color: colors.onSurfaceTertiary }}>
              {verifying ? "Verifying payment..." : provider === "mock" ? "Processing test payment..." : "Loading Razorpay..."}
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
