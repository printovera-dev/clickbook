// Auto-advancing responsive image slider fed by backend CMS slides. Swipe to change, pauses while the user
// interacts, dots indicator, images cover-cropped (never stretched). Renders nothing when no slides.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, useWindowDimensions, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, fonts, radius, spacing } from "@/src/theme";
import { fileUrl } from "@/src/api";

export type Slide = { id: string; image_url: string; title?: string; subtitle?: string; cta_label?: string; cta_route?: string };

const DEFAULT_RATIO = 16 / 9;
const RESUME_AFTER_MS = 5000;

export function AutoSlider({ slides, intervalMs = 4500, testID, sidePadding = spacing.lg, aspectRatio = DEFAULT_RATIO }: { slides: Slide[]; intervalMs?: number; testID?: string; sidePadding?: number; aspectRatio?: number }) {
  const { width: screenW } = useWindowDimensions();
  const availableWidth = screenW - sidePadding * 2;
  const width = aspectRatio < 1 ? Math.min(availableWidth, 500) : availableWidth;
  const height = Math.round(width / aspectRatio);
  const router = useRouter();
  const list = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const next = (indexRef.current + 1) % slides.length;
      list.current?.scrollToIndex({ index: next, animated: true });
      indexRef.current = next; setIndex(next);
    }, intervalMs);
    return () => clearInterval(t);
  }, [slides.length, intervalMs]);

  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    indexRef.current = i; setIndex(i);
  }, [width]);
  const pause = () => { pausedUntil.current = Date.now() + RESUME_AFTER_MS; };

  if (!slides.length) return null;

  return (
    <View style={{ paddingHorizontal: sidePadding, alignItems: "center" }} testID={testID}>
      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.id}
        onScrollBeginDrag={pause}
        onTouchStart={pause}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={1}
        windowSize={3}
        removeClippedSubviews
        style={{ width, height, borderRadius: radius.lg, overflow: "hidden" }}
        renderItem={({ item }) => (
          <Pressable
            testID={`slide-${item.id}`}
            disabled={!item.cta_route}
            onPress={() => item.cta_route && router.push(item.cta_route as any)}
            onTouchStart={pause}
            style={{ width, height, backgroundColor: colors.homeBlueSoft }}
          >
            <Image source={{ uri: fileUrl(item.image_url) }} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.id} transition={200} />
            {item.title || item.cta_label ? (
              <View style={styles.caption}>
                {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
                {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
                {item.cta_label ? <View style={styles.cta}><Text style={styles.ctaText}>{item.cta_label}</Text></View> : null}
              </View>
            ) : null}
          </Pressable>
        )}
      />
      {slides.length > 1 ? (
        <View style={styles.dots} testID={testID ? `${testID}-dots` : undefined}>
          {slides.map((s, i) => <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: "rgba(43,43,46,0.35)" },
  title: { color: "#FFF", fontFamily: fonts.display, fontSize: 20 },
  subtitle: { color: "#FFF", fontFamily: fonts.text, fontSize: 13, marginTop: 2, opacity: 0.9 },
  cta: { alignSelf: "flex-start", marginTop: spacing.sm, backgroundColor: colors.homePink, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  ctaText: { color: "#FFF", fontFamily: fonts.text, fontWeight: "600", fontSize: 13 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { width: 18, backgroundColor: colors.homePink },
});
