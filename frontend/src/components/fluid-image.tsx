// Proportional image: fixed width, height follows the image's real aspect ratio (measured on load), rendered with
// `contain` so artwork is never stretched, cropped or zoomed. Neutral white backdrop — never black. While a new
// image loads, the previous one stays visible (expo-image keeps the last frame) and a soft placeholder shows first.
import { useState } from "react";
import { View, StyleSheet, ActivityIndicator, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors } from "@/src/theme";

type Props = {
  uri?: string;
  width: number;
  /** Fallback ratio (w/h) used until the image reports its own dimensions. */
  ratio?: number;
  maxHeight?: number;
  recyclingKey?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onRatio?: (ratio: number) => void;
};

export function FluidImage({ uri, width, ratio = 16 / 9, maxHeight, recyclingKey, style, testID, onRatio }: Props) {
  const [imgRatio, setImgRatio] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const r = imgRatio || ratio;
  let height = Math.round(width / r);
  let w = width;
  if (maxHeight && height > maxHeight) { height = maxHeight; w = Math.round(maxHeight * r); }
  return (
    <View style={[{ width, height, alignItems: "center", justifyContent: "center", backgroundColor: colors.homeCard }, style]} testID={testID}>
      {uri ? (
        <Image
          source={{ uri }}
          recyclingKey={recyclingKey}
          cachePolicy="memory-disk"
          contentFit="contain"
          contentPosition="center"
          transition={250}
          style={{ width: w, height }}
          onLoad={(e) => {
            const s = e.source;
            if (s?.width && s?.height) { const rr = s.width / s.height; setImgRatio(rr); onRatio?.(rr); }
            setLoaded(true);
          }}
        />
      ) : null}
      {!loaded ? <View style={[StyleSheet.absoluteFill, styles.placeholder]} pointerEvents="none"><ActivityIndicator color={colors.homePink} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.homeBlueSoft },
});
