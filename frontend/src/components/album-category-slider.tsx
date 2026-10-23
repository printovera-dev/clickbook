import { useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Feather from "@react-native-vector-icons/feather";
import { fileUrl } from "@/src/api";
import { Thumb } from "@/src/components/thumb";
import { MAX_CONTENT_W } from "@/src/layout";
import { colors, fonts, radius, spacing } from "@/src/theme";

type CategorySlide = { id: string; image_url?: string; title?: string; subtitle?: string; cta_route?: string; active?: boolean; order?: number };
export function AlbumCategorySlider({ slides, intervalMs = 1800, onCreate }: { slides: CategorySlide[]; intervalMs?: number; onCreate: () => void }) {
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, MAX_CONTENT_W);
  const cardW = Math.min(168, Math.max(86, (contentW - spacing.lg * 2 - spacing.md * 3) / 4));
  const gap = spacing.md;
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const paused = useRef(false);
  const usable = (slides || []).filter((s) => s.active !== false && s.image_url).sort((a,b) => (a.order || 0) - (b.order || 0));
  useEffect(() => {
    if (usable.length < 2) return;
    const timer = setInterval(() => {
      if (paused.current) return;
      const next = offsetRef.current + cardW + gap;
      const max = Math.max(0, usable.length * (cardW + gap) - gap);
      const value = next >= max - 2 ? 0 : next;
      offsetRef.current = value;
      scrollRef.current?.scrollTo({ x: value, animated: true });
    }, Math.max(900, Math.round(intervalMs / 1.8)));
    return () => clearInterval(timer);
  }, [usable.length, cardW, gap, intervalMs]);
  if (!usable.length) return null;
  return (
    <View testID="home-album-categories" style={styles.wrap}>
      <Text style={styles.heading}>Pick Your ClickBook</Text>
      <Text style={styles.subtitle}>Bring your memories to life.</Text>
      <View style={{ position: "relative" }}>
        <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}
          onScrollBeginDrag={() => { paused.current = true; }} onScrollEndDrag={() => { paused.current = false; }} scrollEventThrottle={16}>
          {usable.map((slide) => (
            <Pressable key={slide.id} testID={`home-album-category-${slide.id}`} accessibilityRole="button" accessibilityLabel={`Explore ${slide.title || "album"} designs`} onPress={onCreate} style={{ width: cardW }}>
              <View style={[styles.cover, { width: cardW, height: cardW }]}>
                <Thumb uri={fileUrl(slide.image_url)} recyclingKey={slide.id} style={{ width: "100%", height: "100%" }} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{slide.title || "Album"}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {usable.length > 4 ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous album categories" onPress={() => { const value = Math.max(0, offsetRef.current - (cardW + gap)); offsetRef.current = value; scrollRef.current?.scrollTo({ x: value, animated: true }); }} style={[styles.arrow, { left: 2 }]}><Feather name="chevron-left" size={18} color={colors.homeCharcoal} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Next album categories" onPress={() => { const max = Math.max(0, usable.length * (cardW + gap) - gap); const value = Math.min(max, offsetRef.current + (cardW + gap)); offsetRef.current = value; scrollRef.current?.scrollTo({ x: value, animated: true }); }} style={[styles.arrow, { right: 2 }]}><Feather name="chevron-right" size={18} color={colors.homeCharcoal} /></Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.homeCard, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  heading: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, textAlign: "center", color: colors.homeCharcoal },
  subtitle: { fontFamily: fonts.text, fontSize: 12, textAlign: "center", color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  track: { gap: spacing.md, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  cover: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontFamily: fonts.text, fontSize: 13, fontWeight: "700", color: colors.homeCharcoal, textAlign: "center", marginTop: spacing.xs },
  arrow: { position: "absolute", top: "38%", width: 30, height: 30, borderRadius: 15, backgroundColor: colors.homeCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
});
