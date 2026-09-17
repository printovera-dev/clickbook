// 3D open-book preview: two-page spread, leaves turn around the spine with perspective,
// drag-to-flip (follows the finger) plus arrow controls. Reanimated + Gesture Handler.
import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Text, Pressable, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS, Extrapolation, Easing,
} from "react-native-reanimated";
import Feather from "@react-native-vector-icons/feather";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { PageCanvas } from "@/src/components/page-canvas";
import { Page, Photo, CoverDesign, coverToPage } from "@/src/design";

type Face = { kind: "cover" | "back" | "blank" | "page"; page?: Page; number?: number };

const { width: SCREEN_W } = Dimensions.get("window");
const FLIP_MS = 520;

export function BookPreview({
  cover, coverDesign, pages, photos, size = Math.min(SCREEN_W - 32, 400), albumName, onEditPage, onEditCover, onSelectPage, selectedPage,
}: { cover: any; coverDesign?: CoverDesign | null; pages: Page[]; photos: Photo[]; size?: number; albumName?: string; onEditPage?: (pageIndex: number) => void; onEditCover?: () => void; onSelectPage?: (pageIndex: number | "cover") => void; selectedPage?: number | "cover" | null }) {
  const pageW = size / 2;
  const pageH = pageW; // 8x8" square pages
  const photosById = useMemo(() => Object.fromEntries(photos.map((p) => [p.id, p])), [photos]);

  // Faces in reading order: cover, p1..pn, (blank filler), back cover. Leaf i = faces[2i] (front) + faces[2i+1] (back).
  const faces = useMemo<Face[]>(() => {
    const f: Face[] = [{ kind: "cover" }, ...pages.map((p, i) => ({ kind: "page" as const, page: p, number: i + 1 }))];
    if (f.length % 2 === 0) f.push({ kind: "blank" }); // keep back cover as the back face of the last leaf
    f.push({ kind: "back" });
    return f;
  }, [pages]);
  const leaves = faces.length / 2;

  const [turned, setTurned] = useState(0); // leaves already turned to the left
  const [flip, setFlip] = useState<{ leaf: number; dir: 1 | -1 } | null>(null);
  const progress = useSharedValue(0); // 0 = leaf flat on the right, 1 = flat on the left
  const activeDir = useSharedValue(0);

  useEffect(() => { if (!flip) progress.value = 0; }, [flip, progress]);
  useEffect(() => { setTurned((t) => Math.min(t, leaves)); }, [leaves]);

  const finish = (target: number) => {
    const dir = activeDir.value;
    if (dir === 1 && target === 1) setTurned((t) => Math.min(leaves, t + 1));
    if (dir === -1 && target === 0) setTurned((t) => Math.max(0, t - 1));
    activeDir.value = 0;
    setFlip(null);
  };

  const beginFlip = (dir: 1 | -1) => {
    if (dir === 1 && turned >= leaves) return false;
    if (dir === -1 && turned <= 0) return false;
    activeDir.value = dir;
    setFlip({ leaf: dir === 1 ? turned : turned - 1, dir });
    return true;
  };

  const animateTo = (target: number) => {
    progress.value = withTiming(target, { duration: FLIP_MS, easing: Easing.out(Easing.cubic) }, (done) => {
      if (done) runOnJS(finish)(target);
    });
  };

  const flipForward = () => {
    if (flip || !beginFlip(1)) return;
    progress.value = 0;
    animateTo(1);
  };
  const flipBack = () => {
    if (flip || !beginFlip(-1)) return;
    progress.value = 1;
    animateTo(0);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onUpdate((e) => {
      "worklet";
      if (activeDir.value === 0) {
        if (e.translationX < 0 && turned < leaves) { activeDir.value = 1; runOnJS(setFlip)({ leaf: turned, dir: 1 }); }
        else if (e.translationX > 0 && turned > 0) { activeDir.value = -1; runOnJS(setFlip)({ leaf: turned - 1, dir: -1 }); }
        else return;
      }
      const p = activeDir.value === 1 ? -e.translationX / pageW : 1 - e.translationX / pageW;
      progress.value = Math.min(1, Math.max(0, p));
    })
    .onEnd((e) => {
      "worklet";
      if (activeDir.value === 0) return;
      const p = progress.value;
      const target = activeDir.value === 1
        ? (p > 0.35 || e.velocityX < -350 ? 1 : 0)
        : (p < 0.65 || e.velocityX > 350 ? 0 : 1);
      progress.value = withTiming(target, { duration: 380, easing: Easing.out(Easing.cubic) }, (done) => {
        if (done) runOnJS(finish)(target);
      });
    });

  const tap = Gesture.Tap().numberOfTaps(2).maxDelay(320).onEnd((e) => {
    "worklet";
    if (activeDir.value !== 0) return;
    const right = e.x > (size + 24) / 2;
    runOnJS(handleDoubleTap)(right);
  });
  const singleTap = Gesture.Tap().numberOfTaps(1).maxDuration(250).onEnd((e) => {
    "worklet";
    if (activeDir.value !== 0) return;
    runOnJS(handleSingleTap)(e.x > (size + 24) / 2);
  });
  const composed = Gesture.Exclusive(tap, singleTap, pan);

  function faceAt(right: boolean) {
    return right ? (turned < leaves ? faces[2 * turned] : null) : (turned > 0 ? faces[2 * turned - 1] : null);
  }
  function handleSingleTap(right: boolean) {
    const face = faceAt(right);
    if (!face || !onSelectPage) return;
    if (face.kind === "page") onSelectPage(face.number! - 1);
    if (face.kind === "cover") onSelectPage("cover");
  }
  function handleDoubleTap(right: boolean) {
    const face = faceAt(right);
    if (!face) return;
    if (face.kind === "page" && onEditPage) onEditPage(face.number! - 1);
    if (face.kind === "cover" && onEditCover) onEditCover();
  }

  // Flipping leaf: front face pivots on the spine from the right; back face lands on the left.
  const frontStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: 1400 },
      { translateX: -pageW / 2 },
      { rotateY: `${-180 * progress.value}deg` },
      { translateX: pageW / 2 },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: 1400 },
      { translateX: pageW / 2 },
      { rotateY: `${180 - 180 * progress.value}deg` },
      { translateX: -pageW / 2 },
    ],
  }));
  const frontShade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [0, 0.45], Extrapolation.CLAMP),
  }));
  const backShade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0.45, 0], Extrapolation.CLAMP),
  }));
  // Shadow the moving leaf casts on the pages underneath.
  const rightCast = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.28, 0.08, 0], Extrapolation.CLAMP),
  }));
  const leftCast = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.08, 0.28], Extrapolation.CLAMP),
  }));

  // Static faces under the moving leaf.
  const leftTurned = flip?.dir === 1 ? turned : flip?.dir === -1 ? turned - 1 : turned;
  const rightTurned = flip?.dir === 1 ? turned + 1 : flip?.dir === -1 ? turned : turned;
  const leftFace = leftTurned > 0 ? faces[2 * leftTurned - 1] : null;
  const rightFace = rightTurned < leaves ? faces[2 * rightTurned] : null;
  const isSel = (f: Face | null) => !!f && selectedPage != null && ((f.kind === "page" && selectedPage === f.number! - 1) || (f.kind === "cover" && selectedPage === "cover"));
  const flipFront = flip ? faces[2 * flip.leaf] : null;
  const flipBack_ = flip ? faces[2 * flip.leaf + 1] : null;

  const label = turned === 0 ? "Front cover"
    : turned >= leaves ? "Back cover"
    : (() => {
        const l = faces[2 * turned - 1]; const r = faces[2 * turned];
        const nums = [l, r].filter((f) => f?.kind === "page").map((f) => f!.number);
        return nums.length === 2 ? `Pages ${nums[0]}–${nums[1]} of ${pages.length}` : nums.length === 1 ? `Page ${nums[0]} of ${pages.length}` : "Inside cover";
      })();

  const atStart = turned === 0 && !flip;
  const atEnd = turned >= leaves && !flip;

  return (
    <View style={{ alignItems: "center" }}>
      <GestureDetector gesture={composed}>
        <View style={{ width: size + 24, height: pageH + 36, alignItems: "center", justifyContent: "center" }}>
          {/* Whole book tilted slightly for depth */}
          <View style={{ width: size, height: pageH, transform: [{ perspective: 1600 }, { rotateX: "7deg" }] }}>
            {/* Page-block thickness */}
            {[3, 2, 1].map((i) => (
              <View key={i} style={[styles.block, { left: leftTurned > 0 ? -i * 1.5 : pageW, right: rightTurned < leaves ? -i * 1.5 : pageW, top: i * 1.5, bottom: -i * 1.5, opacity: 1 - i * 0.18 }]} />
            ))}

            {/* Static left page */}
            <View style={[styles.half, { left: 0, width: pageW, height: pageH }, !leftFace && styles.empty]}>
              {leftFace ? <FaceView face={leftFace} photosById={photosById} cover={cover} coverDesign={coverDesign} albumName={albumName} side="left" pageSize={pageW} /> : null}
              {leftFace ? <LinearGradient colors={["rgba(0,0,0,0.22)", "rgba(0,0,0,0)"]} start={{ x: 1, y: 0 }} end={{ x: 0.75, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
              {flip && leftFace ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, leftCast]} /> : null}
              {isSel(leftFace) && !flip ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 3, borderColor: colors.brandPrimary }]} /> : null}
            </View>
            {/* Static right page */}
            <View style={[styles.half, { left: pageW, width: pageW, height: pageH }, !rightFace && styles.empty]}>
              {rightFace ? <FaceView face={rightFace} photosById={photosById} cover={cover} coverDesign={coverDesign} albumName={albumName} side="right" pageSize={pageW} /> : null}
              {rightFace && rightFace.kind !== "cover" ? <LinearGradient colors={["rgba(0,0,0,0.22)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.25, y: 0 }} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
              {flip && rightFace ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, rightCast]} /> : null}
              {isSel(rightFace) && !flip ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderWidth: 3, borderColor: colors.brandPrimary }]} /> : null}
            </View>

            {/* Moving leaf */}
            {flip && flipFront ? (
              <Animated.View style={[styles.half, styles.leaf, { left: pageW, width: pageW, height: pageH }, frontStyle]}>
                <FaceView face={flipFront} photosById={photosById} cover={cover} coverDesign={coverDesign} albumName={albumName} side="right" pageSize={pageW} />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, frontShade]} />
              </Animated.View>
            ) : null}
            {flip && flipBack_ ? (
              <Animated.View style={[styles.half, styles.leaf, { left: 0, width: pageW, height: pageH }, backStyle]}>
                <FaceView face={flipBack_} photosById={photosById} cover={cover} coverDesign={coverDesign} albumName={albumName} side="left" pageSize={pageW} />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, backShade]} />
              </Animated.View>
            ) : null}

            {/* Spine */}
            {leftTurned > 0 && rightTurned < leaves ? <View style={[styles.spine, { left: pageW - 1 }]} /> : null}
          </View>
        </View>
      </GestureDetector>

      <View style={styles.controls}>
        <Pressable testID="preview-prev" onPress={flipBack} style={[styles.ctrlBtn, atStart && { opacity: 0.4 }]} disabled={atStart}>
          <Feather name="chevron-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={{ fontFamily: fonts.text, color: colors.onSurfaceTertiary, minWidth: 130, textAlign: "center" }}>{label}</Text>
        <Pressable testID="preview-next" onPress={flipForward} style={[styles.ctrlBtn, atEnd && { opacity: 0.4 }]} disabled={atEnd}>
          <Feather name="chevron-right" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
    </View>
  );
}

function FaceView({ face, photosById, cover, coverDesign, albumName, side, pageSize }: {
  face: Face; photosById: Record<string, Photo>; cover: any; coverDesign?: CoverDesign | null; albumName?: string; side: "left" | "right"; pageSize: number;
}) {
  if (face.kind === "cover") {
    return coverDesign?.photo_id ? <PageCanvas page={coverToPage(coverDesign)} photosById={photosById} size={pageSize} /> : <CoverFace cover={cover} albumName={albumName} />;
  }
  if (face.kind === "back") {
    return (
      <View style={[styles.face, { backgroundColor: colors.onSurface, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: colors.onSurfaceInverse, fontFamily: fonts.text, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>ClickBook</Text>
      </View>
    );
  }
  if (face.kind === "blank") {
    return <View style={[styles.face, { backgroundColor: colors.surfaceSecondary }]} />;
  }
  return <PageCanvas page={face.page!} photosById={photosById} size={pageSize} pageNumber={face.number!} numberSide={side} />;
}

function CoverFace({ cover, albumName }: { cover: any; albumName?: string }) {
  return (
    <View style={styles.face}>
      {cover?.image_url ? (
        <Image source={{ uri: cover.image_url }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.brandPrimary }]} />
      )}
      <LinearGradient colors={["rgba(28,25,23,0.05)", "rgba(28,25,23,0.65)"]} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", bottom: 16, left: 14, right: 14 }}>
        <Text style={{ color: "#FFF", fontFamily: fonts.text, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>ClickBook</Text>
        <Text style={{ color: "#FFF", fontFamily: fonts.display, fontSize: 18, marginTop: 2 }} numberOfLines={2}>{albumName || "My Album"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  half: { position: "absolute", top: 0, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  empty: { backgroundColor: "transparent" },
  leaf: { zIndex: 10, elevation: 10, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  block: { position: "absolute", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 2 },
  face: { flex: 1 },
  spine: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 5 },
  controls: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.lg },
  ctrlBtn: { padding: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
