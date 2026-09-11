import { Pressable, StyleSheet, Text, ActivityIndicator, ViewStyle } from "react-native";
import { colors, radius, spacing, fonts } from "./theme";

type Variant = "primary" | "secondary" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  testID,
  style,
  fullWidth = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
  fullWidth?: boolean;
}) {
  const bg =
    variant === "primary" ? colors.brandPrimary :
    variant === "secondary" ? colors.surfaceTertiary :
    variant === "outline" ? colors.surface : "transparent";
  const fg =
    variant === "primary" ? colors.onBrandPrimary :
    variant === "secondary" ? colors.onSurfaceTertiary :
    variant === "outline" ? colors.onSurface : colors.brandPrimary;
  const border = variant === "outline" ? colors.borderStrong : "transparent";
  const paddingV = size === "sm" ? 10 : size === "lg" ? 18 : 14;
  const fontSize = size === "sm" ? 14 : size === "lg" ? 17 : 15;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === "outline" ? 1 : 0,
          borderRadius: radius.pill,
          paddingVertical: paddingV,
          paddingHorizontal: spacing.xl,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: fullWidth ? "stretch" : "flex-start",
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <Text style={{ color: fg, fontSize, fontWeight: "500", fontFamily: fonts.text, letterSpacing: 0.2 }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  display: { fontFamily: fonts.display, color: colors.onSurface, fontWeight: "500" as any },
  displayHero: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 34, lineHeight: 40, fontWeight: "500" as any },
  h1: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 26, lineHeight: 32, fontWeight: "500" as any },
  h2: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 20, lineHeight: 26, fontWeight: "500" as any },
  body: { fontFamily: fonts.text, color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  bodyMuted: { fontFamily: fonts.text, color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.text, color: colors.onSurfaceTertiary, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" as any },
});
