// Reanimated 2D-perspective page-flip photo book preview.
import { useMemo, useState } from "react";
import { View, StyleSheet, Text, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS,
} from "react-native-reanimated";
import Feather from "@react-native-vector-icons/feather";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { fileUrl } from "@/src/api";

type Page = {
  id: string;
  photo_ids: string[];
  layout_photo_count: number;
  background: string;
  text?: string;
};
type Photo = { id: string; preview_url?: string; thumbnail_url?: string; original_url?: string };

const { width: SCREEN_W } = Dimensions.get("window");

export function BookPreview({
  cover,
  pages,
  photos,
  size = Math.min(SCREEN_W - 40, 360),
  albumName,
}: {
  cover: any;
  pages: Page[];
  photos: Photo[];
  size?: number;
  albumName?: string;
}) {
  const photosById = useMemo(() => Object.fromEntries(photos.map((p) => [p.id, p])), [photos]);
  // "spread" index: 0 = closed (cover), then each spread shows page N (right side flips to reveal next)
  const [spread, setSpread] = useState(0);
  const rotate = useSharedValue(0); // -180 (fully flipped forward) .. 0 (rest) .. 180 (backward)
  const totalSpreads = pages.length + 1; // cover + pages

  const flipForward = (target?: number) => {
    if (spread >= totalSpreads - 1) return;
    rotate.value = withTiming(-180, { duration: 550 }, (finished) => {
      if (finished) {
        rotate.value = 0;
        runOnJS(setSpread)(target !== undefined ? target : spread + 1);
      }
    });
  };
  const flipBack = () => {
    if (spread === 0) return;
    rotate.value = withTiming(180, { duration: 550 }, (finished) => {
      if (finished) {
        rotate.value = 0;
        runOnJS(setSpread)(spread - 1);
      }
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((e) => {
      "worklet";
      if (e.translationX < -60) {
        rotate.value = withTiming(-180, { duration: 550 }, (finished) => {
          if (finished) {
            rotate.value = 0;
            runOnJS(setSpread)(Math.min(totalSpreads - 1, spread + 1));
          }
        });
      } else if (e.translationX > 60) {
        rotate.value = withTiming(180, { duration: 550 }, (finished) => {
          if (finished) {
            rotate.value = 0;
            runOnJS(setSpread)(Math.max(0, spread - 1));
          }
        });
      }
    });

  const flippingStyle = useAnimatedStyle(() => {
    // rotate -180..180 mapped to rotateY 0..-180 (forward flip) or 0..180 (backward flip)
    const rotY = rotate.value;
    // opacity dims mid-flip
    const opacity = interpolate(Math.abs(rotY), [0, 90, 180], [1, 0.65, 1]);
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${rotY}deg` },
      ],
      opacity,
    };
  });

  const currentPage = spread === 0 ? null : pages[spread - 1];
  const nextPage = spread < pages.length ? pages[spread] : null;

  return (
    <View style={{ alignItems: "center" }}>
      <GestureDetector gesture={pan}>
        <View style={[styles.book, { width: size, height: size }]}>
          {/* Static back layer: shows the CURRENT page (visible until flip completes) */}
          <View style={StyleSheet.absoluteFill}>
            {spread === 0 ? (
              <CoverFace cover={cover} albumName={albumName} />
            ) : (
              <PageFace page={currentPage!} photosById={photosById} pageNumber={spread} />
            )}
          </View>
          {/* Animated top layer: flips to reveal next */}
          <Animated.View style={[StyleSheet.absoluteFill, flippingStyle, { backfaceVisibility: "hidden" }]}>
            {spread === 0 ? (
              <CoverFace cover={cover} albumName={albumName} />
            ) : (
              <PageFace page={currentPage!} photosById={photosById} pageNumber={spread} />
            )}
          </Animated.View>
          {/* Spine shadow */}
          <View style={styles.spine} />
        </View>
      </GestureDetector>

      <View style={styles.controls}>
        <Pressable testID="preview-prev" onPress={flipBack} style={styles.ctrlBtn} disabled={spread === 0}>
          <Feather name="chevron-left" size={22} color={spread === 0 ? colors.muted : colors.onSurface} />
        </Pressable>
        <Text style={{ fontFamily: fonts.text, color: colors.onSurfaceTertiary }}>
          {spread === 0 ? "Cover" : `Page ${spread} of ${pages.length}`}
        </Text>
        <Pressable testID="preview-next" onPress={() => flipForward()} style={styles.ctrlBtn} disabled={spread >= totalSpreads - 1}>
          <Feather name="chevron-right" size={22} color={spread >= totalSpreads - 1 ? colors.muted : colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

function CoverFace({ cover, albumName }: { cover: any; albumName?: string }) {
  return (
    <View style={styles.face}>
      {cover?.image_url ? (
        <Image source={{ uri: cover.image_url }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.brandPrimary }]} />
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: "rgba(28,25,23,0.35)" }} />
      <View style={{ position: "absolute", bottom: 24, left: 20, right: 20 }}>
        <Text style={{ color: "#FFF", fontFamily: fonts.text, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>ClickBook</Text>
        <Text style={{ color: "#FFF", fontFamily: fonts.display, fontSize: 24, marginTop: 4 }}>{albumName || "My Album"}</Text>
      </View>
    </View>
  );
}

function PageFace({ page, photosById, pageNumber }: { page: Page; photosById: Record<string, Photo>; pageNumber: number }) {
  const photos = page.photo_ids.map((id) => photosById[id]).filter(Boolean);
  const n = photos.length;
  return (
    <View style={[styles.face, { backgroundColor: page.background || "#FFF", padding: 12 }]}>
      {n === 1 && photos[0]?.preview_url ? (
        <Image source={{ uri: photos[0].preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
      ) : n === 2 ? (
        <View style={{ flex: 1, gap: 8 }}>
          <Image source={{ uri: photos[0]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
          <Image source={{ uri: photos[1]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
        </View>
      ) : n === 3 ? (
        <View style={{ flex: 1, gap: 8 }}>
          <Image source={{ uri: photos[0]?.preview_url }} style={{ flex: 1.35, borderRadius: 2 }} contentFit="cover" />
          <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
            <Image source={{ uri: photos[1]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
            <Image source={{ uri: photos[2]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
          </View>
        </View>
      ) : n >= 4 ? (
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
            <Image source={{ uri: photos[0]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
            <Image source={{ uri: photos[1]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
          </View>
          <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
            <Image source={{ uri: photos[2]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
            <Image source={{ uri: photos[3]?.preview_url }} style={{ flex: 1, borderRadius: 2 }} contentFit="cover" />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: 2 }} />
      )}
      {page.text ? (
        <Text style={{ position: "absolute", bottom: 12, left: 12, right: 12, color: colors.onSurface, fontFamily: fonts.display, fontSize: 14 }}>
          {page.text}
        </Text>
      ) : null}
      <Text style={styles.pageNum}>{pageNumber}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  book: { borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong },
  face: { flex: 1 },
  spine: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.lg },
  ctrlBtn: { padding: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  pageNum: { position: "absolute", right: 10, bottom: 8, color: colors.muted, fontFamily: fonts.text, fontSize: 10 },
});
