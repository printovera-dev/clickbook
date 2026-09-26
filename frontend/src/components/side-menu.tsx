// Hamburger side menu: Home + legal/FAQ pages (content served by GET /policies/{key}).
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { colors, fonts, radius, spacing } from "@/src/theme";

const ITEMS: { label: string; icon: string; route?: string; policy?: string }[] = [
  { label: "Home", icon: "home", route: "/(tabs)/home" },
  { label: "FAQ", icon: "help-circle", policy: "faq" },
  { label: "Refund & Cancellation", icon: "rotate-ccw", policy: "refund" },
  { label: "Shipping & Delivery", icon: "truck", policy: "shipping" },
  { label: "Terms & Conditions", icon: "file-text", policy: "terms" },
];

export function SideMenu({ visible, onClose, logoUrl }: { visible: boolean; onClose: () => void; logoUrl?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (it: typeof ITEMS[number]) => {
    onClose();
    if (it.policy) router.push({ pathname: "/policy/[key]", params: { key: it.policy } });
    else if (it.route) router.replace(it.route as any);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} testID="menu-backdrop" />
        <View style={[styles.drawer, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} testID="side-menu">
          <View style={styles.head}>
            <Text style={styles.brand}>Click<Text style={{ color: colors.homePink }}>Book</Text></Text>
            <Pressable onPress={onClose} testID="menu-close" hitSlop={12}><Feather name="x" size={22} color={colors.homeCharcoal} /></Pressable>
          </View>
          <Text style={styles.tag}>Preserving memories</Text>
          {ITEMS.map((it) => (
            <Pressable key={it.label} testID={`menu-${it.label.toLowerCase().replace(/[^a-z]+/g, "-")}`} onPress={() => go(it)} style={styles.item}>
              <Feather name={it.icon as any} size={18} color={colors.homeBlue} />
              <Text style={styles.itemText}>{it.label}</Text>
              <Feather name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, flexDirection: "row-reverse", backgroundColor: "rgba(43,43,46,0.45)" },
  drawer: { width: "78%", maxWidth: 340, backgroundColor: colors.homeBg, paddingHorizontal: spacing.xl, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontFamily: fonts.text, fontSize: 24, fontWeight: "800", color: colors.homeCharcoal },
  tag: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: colors.muted, marginBottom: spacing.xl },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.homeCard, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  itemText: { flex: 1, fontFamily: fonts.text, fontSize: 15, color: colors.homeCharcoal },
});
