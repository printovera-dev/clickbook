// Design tokens for ClickBook - Editorial Mobile LIGHT
import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FAFAF8",
  onSurface: "#1C1917",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1917",
  surfaceTertiary: "#F0EFEA",
  onSurfaceTertiary: "#44403C",
  surfaceInverse: "#1C1917",
  onSurfaceInverse: "#FAFAF8",
  muted: "#78716C",

  brand: "#C56A47",
  onBrand: "#FFFFFF",
  brandPrimary: "#C56A47",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D48B6F",
  onBrandSecondary: "#1C1917",
  brandTertiary: "#F2D8CE",
  onBrandTertiary: "#7A3E27",

  success: "#4A7C59",
  onSuccess: "#FFFFFF",
  warning: "#D99A29",
  onWarning: "#FFFFFF",
  error: "#B94A48",
  onError: "#FFFFFF",
  info: "#4A6C7C",
  onInfo: "#FFFFFF",

  border: "#E6E4DD",
  borderStrong: "#C2C0B8",
  divider: "#E6E4DD",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// Typography
export const fonts = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" })!,
  displayItalic: Platform.select({ ios: "Georgia-Italic", android: "serif", default: "Georgia, serif" })!,
  text: Platform.select({ ios: "System", android: "sans-serif", default: "System" })!,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export const colors = light;

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
