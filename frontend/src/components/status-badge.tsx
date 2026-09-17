// Order status badge — colours come from the backend order document (payment_status + production_status).
import { View, Text } from "react-native";
import { colors, fonts } from "@/src/theme";

export function orderStatus(o: any): { label: string; color: string; bg: string; paid: boolean } {
  const paid = o?.payment_status === "paid";
  if (!paid) return { label: "Payment incomplete", color: colors.error, bg: "#FBE9E7", paid };
  const st = o?.production_status || "processing";
  if (st === "delivered") return { label: "Delivered", color: colors.success, bg: "#E6F1E9", paid };
  if (st === "out_for_delivery") return { label: "Out for delivery", color: colors.warning, bg: "#FBF1DC", paid };
  if (st === "cancelled" || st === "refunded") return { label: st[0].toUpperCase() + st.slice(1), color: colors.muted, bg: colors.surfaceTertiary, paid };
  return { label: st[0].toUpperCase() + st.slice(1), color: colors.info, bg: "#E3ECF0", paid };
}

export function StatusBadge({ order, testID }: { order: any; testID?: string }) {
  const st = orderStatus(order);
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: st.bg, borderWidth: 1, borderColor: st.color, marginTop: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
      <Text style={{ color: st.color, fontFamily: fonts.text, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "600" }}>{st.label}</Text>
    </View>
  );
}
