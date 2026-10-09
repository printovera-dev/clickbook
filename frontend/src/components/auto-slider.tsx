// CMS-fed media slider (images + MP4 videos in any order). Horizontal paging ScrollView with CSS scroll-snap on
// web — every slide is mounted (no virtualization), which fixes the iPhone bug where only the first image loaded
// and manual swiping did nothing. Supports "landscape" (sliders 2/3) and "portrait" (slider 1: 4:5, centred,
// ~500×750 on desktop, 90vw on phones, thumbnails below). Images use `contain` (never stretched/cropped); videos
// play inside the same media box, start muted, pause when swiped away, and expose tap controls (play/pause, mute).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Platform, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@react-native-vector-icons/feather";
import { VideoView, useVideoPlayer } from "expo-video";
import { fileUrl } from "@/src/api";
import { FluidImage } from "@/src/components/fluid-image";
import { Thumb } from "@/src/components/thumb";
import { MAX_CONTENT_W } from "@/src/layout";
import { colors, fonts, radius, spacing } from "@/src/theme";

export type Slide = {
  id: string; type?: "image" | "video"; image_url?: string; video_url?: string;
  title?: string; subtitle?: string; cta_label?: string; cta_route?: string;
};

type Props = {
  slides: Slide[]; intervalMs?: number; testID?: string; sidePadding?: number;
  orientation?: "landscape" | "portrait";
};

const PORTRAIT_RATIO = 4 / 5;
const LANDSCAPE_RATIO = 16 / 9;

export function AutoSlider({ slides, intervalMs = 4500, testID, sidePadding = spacing.lg, orientation = "landscape" }: Props) {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, MAX_CONTENT_W) - sidePadding * 2;
  const portrait = orientation === "portrait";
  // Portrait: ~500×625 centred on desktop, 90vw on phones. Landscape: full content width at the artwork's ratio.
  const [ratio, setRatio] = useState(portrait ? PORTRAIT_RATIO : LANDSCAPE_RATIO);
  const mediaW = portrait ? Math.min(500, Math.round(screenW * 0.9), contentW) : contentW;
  const mediaH = portrait ? Math.round(mediaW / PORTRAIT_RATIO) : Math.min(560, Math.round(mediaW / ratio));
  const pageW = contentW; // one page = full content width; media is centred inside

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const pausedRef = useRef(false);
  const videoPlayingRef = useRef(false);

  const go = useCallback((i: number, animated = true) => {
    const n = ((i % slides.length) + slides.length) % slides.length;
    scrollRef.current?.scrollTo({ x: n * pageW, animated });
    indexRef.current = n; setIndex(n);
  }, [slides.length, pageW]);

  // Auto-advance only through images; a visible/playing video holds the slider.
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => {
      if (pausedRef.current || videoPlayingRef.current) return;
      if (slides[indexRef.current]?.type === "video") return;
      go(indexRef.current + 1);
    }, intervalMs);
    return () => clearInterval(t);
  }, [slides, intervalMs, go]);

  // Keep the current page aligned after rotation / resize.
  useEffect(() => { scrollRef.current?.scrollTo({ x: indexRef.current * pageW, animated: false }); }, [pageW]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
    if (i !== indexRef.current) { indexRef.current = i; setIndex(i); }
    pausedRef.current = false;
  };

  const items = useMemo(() => slides.map((s) => ({ ...s, type: s.type || (s.video_url ? "video" : "image") })), [slides]);
  if (!items.length) return null;

  return (
    <View testID={testID} style={{ alignItems: "center" }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={pageW}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        nestedScrollEnabled
        onScrollBeginDrag={() => { pausedRef.current = true; }}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={Platform.OS === "web" ? onMomentumEnd : undefined}
        scrollEventThrottle={16}
        style={{ width: pageW }}
        contentContainerStyle={{ alignItems: "center" }}
        // @ts-expect-error web-only: real CSS scroll-snap + horizontal touch panning on iOS Safari
        {...(Platform.OS === "web" ? { dataSet: { slider: "1" }, style: { width: pageW, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" } } : {})}
      >
        {items.map((item, i) => (
          <View key={item.id} testID={`slide-${item.id}`} style={[{ width: pageW, alignItems: "center" }, Platform.OS === "web" ? ({ scrollSnapAlign: "start" } as any) : null]}>
            <View style={[styles.media, { width: mediaW, height: mediaH }, portrait && styles.portraitFrame]}>
              {item.type === "video" ? (
                <VideoSlide uri={fileUrl(item.video_url)} poster={fileUrl(item.image_url)} active={i === index} width={mediaW} height={mediaH}
                  onPlaying={(p) => { videoPlayingRef.current = p && i === indexRef.current; }} testID={`slide-video-${item.id}`} />
              ) : (
                <FluidImage uri={fileUrl(item.image_url)} width={mediaW} ratio={portrait ? PORTRAIT_RATIO : ratio} maxHeight={mediaH} recyclingKey={item.id}
                  onRatio={(r) => { if (!portrait && Math.abs(r - ratio) > 0.01) setRatio(r); }} style={{ height: mediaH }} />
              )}
              {item.title || item.subtitle || item.cta_label ? (
                <View style={styles.caption} pointerEvents="box-none">
                  {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
                  {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
                  {item.cta_label ? (
                    <Pressable testID={`slide-cta-${item.id}`} onPress={() => item.cta_route && router.push(item.cta_route as any)} style={styles.cta}>
                      <Text style={styles.ctaTxt}>{item.cta_label}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {items.length > 1 ? (
        <View style={styles.dots} testID={`${testID}-dots`}>
          {items.map((it, i) => (
            <Pressable key={it.id} testID={`${testID}-dot-${i}`} onPress={() => go(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Go to slide ${i + 1}`}
              style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}

      {portrait && items.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs} style={{ maxWidth: contentW }} testID={`${testID}-thumbs`}>
          {items.map((it, i) => (
            <Pressable key={it.id} testID={`${testID}-thumb-${i}`} onPress={() => go(i)} style={[styles.thumb, i === index && styles.thumbActive]}>
              <Thumb uri={fileUrl(it.image_url)} recyclingKey={`t-${it.id}`} style={{ width: 44, height: 55, borderRadius: 6 }} />
              {it.type === "video" ? <View style={styles.thumbPlay}><Feather name="play" size={10} color="#FFF" /></View> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function VideoSlide({ uri, poster, active, width, height, onPlaying, testID }: {
  uri?: string; poster?: string; active: boolean; width: number; height: number; onPlaying: (p: boolean) => void; testID?: string;
}) {
  const player = useVideoPlayer(uri || null, (p) => { p.loop = true; p.muted = true; });
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e: any) => { const p = !!(e?.isPlaying ?? e); setPlaying(p); onPlaying(p); });
    return () => sub.remove();
  }, [player, onPlaying]);
  // Swiping away pauses the video (and lets the slider auto-advance again).
  useEffect(() => { if (!active && playing) player.pause(); }, [active, playing, player]);

  const toggle = () => { if (playing) player.pause(); else { setStarted(true); player.play(); } };
  const toggleMute = () => { player.muted = !muted; setMuted(!muted); };

  return (
    <View style={{ width, height, backgroundColor: colors.homeCharcoal }} testID={testID}>
      <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />
      {!started && poster ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <FluidImage uri={poster} width={width} ratio={width / height} maxHeight={height} style={{ height }} />
        </View>
      ) : null}
      {/* Tap anywhere on the media to play / pause */}
      <Pressable onPress={toggle} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={playing ? "Pause video" : "Play video"} testID={`${testID}-toggle`}>
        {!playing ? (
          <View style={styles.playBig}><Feather name="play" size={28} color="#FFF" /></View>
        ) : null}
      </Pressable>
      <View style={styles.videoBadge} pointerEvents="none"><Feather name="video" size={12} color="#FFF" /><Text style={styles.videoBadgeTxt}>Video</Text></View>
      <Pressable onPress={toggleMute} hitSlop={8} style={styles.muteBtn} accessibilityRole="button" accessibilityLabel={muted ? "Unmute" : "Mute"} testID={`${testID}-mute`}>
        <Feather name={muted ? "volume-x" : "volume-2"} size={16} color="#FFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  media: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.homeCard },
  portraitFrame: { borderRadius: 20, borderWidth: 1.5, borderColor: colors.homeBlueSoft },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: "rgba(43,43,46,0.45)" },
  title: { fontFamily: fonts.text, fontSize: 20, fontWeight: "800", color: "#FFF" },
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: "#FFF", opacity: 0.92, marginTop: 2 },
  cta: { alignSelf: "flex-start", marginTop: spacing.sm, backgroundColor: colors.homePink, paddingHorizontal: 16, minHeight: 36, justifyContent: "center", borderRadius: radius.pill },
  ctaTxt: { color: "#FFF", fontFamily: fonts.text, fontWeight: "700", fontSize: 13 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: spacing.sm, minHeight: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.homePink },
  thumbs: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: 2 },
  thumb: { borderRadius: 8, padding: 2, borderWidth: 2, borderColor: "transparent" },
  thumbActive: { borderColor: colors.homePink },
  thumbPlay: { position: "absolute", right: 6, bottom: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  playBig: { position: "absolute", top: "50%", left: "50%", marginLeft: -32, marginTop: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", paddingLeft: 4 },
  videoBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  videoBadgeTxt: { color: "#FFF", fontFamily: fonts.text, fontSize: 11, fontWeight: "600" },
  muteBtn: { position: "absolute", top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
});
