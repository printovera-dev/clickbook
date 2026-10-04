// Responsive layout constants shared by the customer web/mobile screens.
// Content is centred and capped on tablets/desktops so the same mobile-first sections scale up gracefully.
import { useWindowDimensions } from "react-native";

export const MAX_CONTENT_W = 1080;
export const BP_TABLET = 720;
export const BP_DESKTOP = 1024;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const contentW = Math.min(width, MAX_CONTENT_W);
  return {
    width, height, contentW,
    isTablet: width >= BP_TABLET,
    isDesktop: width >= BP_DESKTOP,
    columns: width >= BP_DESKTOP ? 3 : width >= BP_TABLET ? 2 : 1,
  };
}
