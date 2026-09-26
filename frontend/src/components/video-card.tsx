// 16:9 video card (YouTube/Vimeo URL from CMS): thumbnail + play button; opens an embedded 16:9 player.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, useWindowDimensions, Platform, Linking } from "react-native";
import { Image } from "expo-image";
import Feather from "@react-native-vector-icons/feather";
import { WebView } from "react-native-webview";
import { colors, fonts, radius, spacing } from "@/src/theme";

export type Video = { id: string; url: string; title: string; description?: string };

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|embed\/|watch\?v=))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}
function embedUrl(url: string): string | null {
  const y = youtubeId(url); if (y) return `https://www.youtube.com/embed/${y}?autoplay=1&playsinline=1&rel=0`;
  const v = vimeoId(url); if (v) return `https://player.vimeo.com/video/${v}?autoplay=1`;
  return null;
}
function thumbUrl(url: string): string | undefined {
  const y = youtubeId(url);
  return y ? `https://img.youtube.com/vi/${y}/hqdefault.jpg` : undefined;
}

export function VideoCard({ video, width }: { video: Video; width: number }) {
  const [open, setOpen] = useState(false);
  const height = Math.round(width / (16 / 9));
  const { width: sw } = useWindowDimensions();
  const embed = embedUrl(video.url);
  const play = () => (embed ? setOpen(true) : Linking.openURL(video.url));
  return (
    <View style={[styles.card, { width }]} testID={`video-${video.id}`}>
      <Pressable onPress={play} style={{ width, height, backgroundColor: colors.homeCharcoal }} testID={`video-play-${video.id}`}>
        <Image source={{ uri: thumbUrl(video.url) }} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={video.id} />
        <View style={styles.playWrap}><View style={styles.play}><Feather name="play" size={22} color="#FFF" /></View></View>
      </Pressable>
      <View style={{ padding: spacing.md }}>
        <Text style={styles.title} numberOfLines={1}>{video.title}</Text>
        {video.description ? <Text style={styles.desc} numberOfLines={2}>{video.description}</Text> : null}
      </View>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
        <View style={styles.player}>
          <Pressable onPress={() => setOpen(false)} style={styles.close} testID="video-close" hitSlop={12}><Feather name="x" size={24} color="#FFF" /></Pressable>
          {embed ? (
            <View style={{ width: sw, height: Math.round(sw / (16 / 9)), backgroundColor: "#000" }}>
              {Platform.OS === "web"
                ? <iframe src={embed} width="100%" height="100%" style={{ border: 0 }} allow="autoplay; encrypted-media; fullscreen" />
                : <WebView source={{ uri: embed }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} allowsFullscreenVideo style={{ flex: 1, backgroundColor: "#000" }} />}
            </View>
          ) : null}
          <Text style={[styles.title, { color: "#FFF", marginTop: spacing.lg, paddingHorizontal: spacing.xl }]}>{video.title}</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.homeCard, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  playWrap: { position: "absolute", inset: 0 as any, alignItems: "center", justifyContent: "center" },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.homePink, alignItems: "center", justifyContent: "center", paddingLeft: 3 },
  title: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: colors.homeCharcoal },
  desc: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  player: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  close: { position: "absolute", top: 48, right: 20, zIndex: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
