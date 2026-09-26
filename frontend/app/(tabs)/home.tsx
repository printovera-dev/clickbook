// ClickBook Home — CMS-driven landing page (GET /home). Sections are rendered through a FlatList so lower
// sections mount lazily as the user scrolls; sliders/videos/heroes are all editable from Admin → Home Page.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, Animated, RefreshControl, useWindowDimensions, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { useQuery } from "@tanstack/react-query";
import { api, fileUrl, getToken } from "@/src/api";
import { AutoSlider } from "@/src/components/auto-slider";
import { HomeLogin } from "@/src/components/home-login";
import { SideMenu } from "@/src/components/side-menu";
import { VideoCard } from "@/src/components/video-card";
import { Thumb } from "@/src/components/thumb";
import { colors, spacing, radius, fonts } from "@/src/theme";

const STEP_COLORS = [colors.homeBlue, colors.homePink, colors.homeMint, "#8B6FD8", "#E8B43A"];

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [splash, setSplash] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0.85)).current;

  useEffect(() => { getToken().then((t) => setLoggedIn(!!t)); }, []);
  useFocusEffect(useCallback(() => { getToken().then((t) => setLoggedIn(!!t)); }, []));
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    const t = setTimeout(() => Animated.timing(fade, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => setSplash(false)), 1100);
    return () => clearTimeout(t);
  }, [fade, pop]);

  const home = useQuery({ queryKey: ["home"], queryFn: () => api.homeContent(), staleTime: 5 * 60 * 1000 });
  const albums = useQuery({ queryKey: ["albums"], queryFn: () => api.listMyAlbums(), enabled: loggedIn === true });
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api.listMyOrders(), enabled: loggedIn === true });
  const notifs = useQuery({ queryKey: ["notifications"], queryFn: () => api.listNotifications(), enabled: loggedIn === true, refetchInterval: 30000 });

  const c = home.data?.content;
  const pricing = home.data?.pricing;
  const t = c?.texts || {};
  const hero = (key: string) => c?.heroes?.find((h: any) => h.key === key)?.image_url;
  const drafts = (albums.data?.albums || []).filter((a: any) => a.state === "draft" && a.is_complete);
  const activeOrder = (orders.data?.orders || []).find((o: any) => ["processing", "printing", "packaging", "out_for_delivery"].includes(o.production_status));
  const unread = notifs.data?.unread_count || 0;
  const heroH = Math.round((width - spacing.lg * 2) / (16 / 9));

  const sections = useMemo(() => {
    if (!c) return [];
    const isIn = loggedIn === true;
    const list: { key: string; render: () => React.ReactNode }[] = [
      { key: "slider1", render: () => <AutoSlider testID="home-slider1" slides={c.sliders?.slider1?.slides || []} intervalMs={c.sliders?.slider1?.interval_ms} /> },
      { key: "login1", render: () => <HomeLogin testID="home-login1" title={t.login_title} accent={t.login_accent} subtitle={t.login_sub} loggedIn={isIn} /> },
    ];
    if (isIn && (drafts.length || activeOrder)) list.push({ key: "mine", render: () => (
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Your ClickBooks</Text>
          <Pressable onPress={() => router.push("/(tabs)/albums")} testID="home-see-all-albums"><Text style={{ color: colors.homeBlue, fontFamily: fonts.text }}>See all</Text></Pressable>
        </View>
        {activeOrder ? (
          <Pressable testID="home-active-order" onPress={() => router.push({ pathname: "/order/[id]", params: { id: activeOrder.id } })} style={styles.orderCard}>
            <Feather name="package" size={22} color={colors.homeBlue} />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={styles.cardTitle}>{activeOrder.order_no}</Text>
              <Text style={styles.muted}>{activeOrder.production_status.replace(/_/g, " ")} · {activeOrder.sheets} sheets</Text>
            </View>
            <Feather name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ) : null}
        {drafts.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.md }}>
            {drafts.slice(0, 8).map((a: any) => (
              <Pressable key={a.id} testID={`home-draft-${a.id}`} style={styles.draftCard} onPress={() => router.push({ pathname: "/album/[id]/preview", params: { id: a.id } })}>
                <Thumb uri={a.cover_thumbnail_url} recyclingKey={a.id} style={{ width: "100%", height: 110 }} />
                <View style={{ padding: spacing.md }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{a.name}</Text>
                  <Text style={styles.muted}>{a.photos?.length || 0} photos · draft</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    ) });
    list.push(
      { key: "pricing", render: () => (
        <View style={styles.section} testID="home-pricing">
          {hero("pricing") ? <Image source={{ uri: fileUrl(hero("pricing")) }} style={[styles.hero, { height: heroH }]} contentFit="cover" cachePolicy="memory-disk" transition={200} /> : null}
          {pricing ? (
            <View style={styles.priceRow}>
              <View style={[styles.priceCell, { backgroundColor: colors.homeBlueSoft }]}>
                <Text style={styles.priceLabel}>{pricing.min_sheets}-page album</Text>
                <Text style={[styles.priceValue, { color: colors.homeBlue }]} testID="home-base-price">₹{pricing.base_price.toLocaleString("en-IN")}</Text>
                <Text style={styles.muted}>{pricing.size.replace("x", " × ")} inch · incl. GST</Text>
              </View>
              <View style={[styles.priceCell, { backgroundColor: colors.homeMintSoft }]}>
                <Text style={styles.priceLabel}>Extra sheet</Text>
                <Text style={[styles.priceValue, { color: colors.homeMint }]}>₹{pricing.price_per_sheet}</Text>
                <Text style={styles.muted}>Free delivery across India</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) },
      { key: "steps", render: () => (
        <View style={styles.section} testID="home-steps">
          <Text style={styles.h}>{t.steps_title} <Feather name="heart" size={18} color={colors.homePink} /></Text>
          {hero("steps") ? <Image source={{ uri: fileUrl(hero("steps")) }} style={[styles.hero, { height: heroH, marginTop: spacing.md }]} contentFit="cover" cachePolicy="memory-disk" transition={200} /> : null}
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {(c.steps || []).map((st: any, i: number) => (
              <View key={st.n} style={styles.stepRow} testID={`home-step-${i + 1}`}>
                <View style={[styles.stepNum, { backgroundColor: STEP_COLORS[i % STEP_COLORS.length] }]}><Text style={styles.stepNumText}>{st.n}</Text></View>
                <Text style={styles.stepText}>{st.title}</Text>
              </View>
            ))}
          </View>
        </View>
      ) },
      { key: "why", render: () => (
        <View style={styles.section} testID="home-why">
          <Text style={styles.h}>{t.why_title}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingTop: spacing.md, paddingRight: spacing.lg }}>
            {(c.videos || []).map((v: any) => <VideoCard key={v.id} video={v} width={Math.min(300, width - spacing.lg * 2 - 24)} />)}
          </ScrollView>
        </View>
      ) },
      { key: "slider2", render: () => <AutoSlider testID="home-slider2" slides={c.sliders?.slider2?.slides || []} intervalMs={c.sliders?.slider2?.interval_ms} /> },
      { key: "privacy", render: () => (
        <View style={styles.section} testID="home-privacy">
          <Text style={styles.h}>{t.privacy_title}</Text>
          {hero("privacy") ? <Image source={{ uri: fileUrl(hero("privacy")) }} style={[styles.hero, { height: heroH, marginTop: spacing.md }]} contentFit="cover" cachePolicy="memory-disk" transition={200} /> : null}
          <Text style={[styles.muted, { textAlign: "center", marginTop: spacing.md }]}>{t.privacy_sub}</Text>
          <Pressable testID="home-privacy-link" onPress={() => router.push({ pathname: "/policy/[key]", params: { key: "privacy" } })} style={styles.linkBtn}>
            <Feather name="shield" size={16} color={colors.homeBlue} /><Text style={styles.linkBtnText}>Read our Privacy Policy</Text>
          </Pressable>
        </View>
      ) },
      { key: "login2", render: () => <HomeLogin testID="home-login2" title={t.cta_title} loggedIn={isIn} compact /> },
      { key: "slider3", render: () => <AutoSlider testID="home-slider3" slides={c.sliders?.slider3?.slides || []} intervalMs={c.sliders?.slider3?.interval_ms} /> },
      { key: "final", render: () => (
        <View style={styles.section} testID="home-final-hero">
          <Text style={[styles.h, { fontStyle: "italic" }]}>&ldquo;{t.final_quote}&rdquo;</Text>
          <Text style={[styles.muted, { textAlign: "center" }]}>{t.final_sub}</Text>
          {hero("final") ? <Image source={{ uri: fileUrl(hero("final")) }} style={[styles.hero, { height: heroH, marginTop: spacing.md }]} contentFit="cover" cachePolicy="memory-disk" transition={200} /> : null}
        </View>
      ) },
      { key: "login3", render: () => <HomeLogin testID="home-login3" title={t.cta_title} loggedIn={isIn} compact /> },
      { key: "footer", render: () => (
        <View style={styles.footer} testID="home-footer">
          <Text style={styles.brand}>Click<Text style={{ color: colors.homePink }}>Book</Text></Text>
          <Text style={styles.tag}>Preserving memories</Text>
          <View style={styles.footerLinks}>
            {[["faq", "FAQ"], ["privacy", "Privacy"], ["terms", "Terms"], ["refund", "Refunds"], ["shipping", "Shipping"]].map(([k, l]) => (
              <Pressable key={k} onPress={() => router.push({ pathname: "/policy/[key]", params: { key: k } })} testID={`footer-${k}`} hitSlop={8}><Text style={styles.footerLink}>{l}</Text></Pressable>
            ))}
          </View>
          <Text style={[styles.muted, { marginTop: spacing.md }]}>© {new Date().getFullYear()} ClickBook · clickbook.world</Text>
        </View>
      ) },
    );
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, pricing, loggedIn, drafts, activeOrder, width, heroH]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.homeBg }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => setMenu(true)} testID="home-menu" style={styles.iconBtn} hitSlop={8}><Feather name="menu" size={22} color={colors.homeCharcoal} /></Pressable>
        <View style={{ alignItems: "center" }}>
          {c?.logo_url ? <Image source={{ uri: fileUrl(c.logo_url) }} style={{ width: Math.min(264, width - 140), height: 88 }} contentFit="contain" cachePolicy="memory-disk" /> : <Text style={styles.brand}>Click<Text style={{ color: colors.homePink }}>Book</Text></Text>}
        </View>
        <Pressable onPress={() => router.push(loggedIn ? "/notifications" : "/login")} testID="home-notifications-bell" style={styles.iconBtn} hitSlop={8}>
          <Feather name="bell" size={22} color={colors.homeCharcoal} />
          {unread > 0 ? <View style={styles.badge} testID="home-notifications-badge"><Text style={styles.badgeTxt}>{unread > 9 ? "9+" : unread}</Text></View> : null}
        </Pressable>
      </View>

      <FlatList
        testID="home-sections"
        data={sections}
        keyExtractor={(s) => s.key}
        renderItem={({ item }) => <View style={{ marginTop: spacing.xl }}>{item.render()}</View>}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={3}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={home.isFetching} onRefresh={() => { home.refetch(); albums.refetch(); orders.refetch(); }} tintColor={colors.homePink} />}
        ListEmptyComponent={home.isError ? (
          <View style={{ padding: spacing.xxl, alignItems: "center" }}>
            <Text style={styles.muted}>Could not load the home page.</Text>
            <Pressable onPress={() => home.refetch()} testID="home-retry" style={styles.linkBtn}><Text style={styles.linkBtnText}>Retry</Text></Pressable>
          </View>
        ) : null}
      />

      <SideMenu visible={menu} onClose={() => setMenu(false)} />

      {splash ? (
        <Animated.View pointerEvents="none" style={[styles.splash, { opacity: fade }]} testID="home-splash">
          <Animated.View style={{ transform: [{ scale: pop }], alignItems: "center" }}>
            <Text style={[styles.brand, { fontSize: 40 }]}>Click<Text style={{ color: colors.homePink }}>Book</Text><Text style={{ color: colors.homeRed }}>.</Text></Text>
            <Text style={styles.tag}>Preserving memories</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.homeBg, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.homeCard, borderWidth: 1, borderColor: colors.border },
  badge: { position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.homePink, alignItems: "center", justifyContent: "center" },
  badgeTxt: { color: "#FFF", fontSize: 10, fontFamily: fonts.text, fontWeight: "700" },
  brand: { fontFamily: fonts.text, fontSize: 26, fontWeight: "800", color: colors.homeCharcoal, letterSpacing: -0.5 },
  tag: { fontFamily: fonts.text, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: colors.muted, marginTop: 2 },
  section: { paddingHorizontal: spacing.lg },
  h: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.homeCharcoal, textAlign: "center" },
  label: { fontFamily: fonts.text, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted },
  muted: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, lineHeight: 19 },
  cardTitle: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: colors.homeCharcoal },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  hero: { width: "100%", borderRadius: radius.lg, backgroundColor: colors.homeBlueSoft },
  priceRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  priceCell: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  priceLabel: { fontFamily: fonts.text, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: colors.homeCharcoal },
  priceValue: { fontFamily: fonts.text, fontSize: 28, fontWeight: "800", marginVertical: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.homeCard, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 52 },
  stepNum: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: "#FFF", fontFamily: fonts.text, fontWeight: "800", fontSize: 13 },
  stepText: { fontFamily: fonts.text, fontSize: 15, color: colors.homeCharcoal, fontWeight: "600" },
  linkBtn: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.homeBlue, backgroundColor: colors.homeCard },
  linkBtnText: { color: colors.homeBlue, fontFamily: fonts.text, fontWeight: "600" },
  orderCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.homeCard, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, borderRadius: radius.md, marginTop: spacing.md },
  draftCard: { width: 190, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.homeCard, borderWidth: 1, borderColor: colors.border },
  footer: { marginHorizontal: spacing.lg, padding: spacing.xl, alignItems: "center", backgroundColor: colors.homeCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.lg, marginTop: spacing.lg },
  footerLink: { fontFamily: fonts.text, fontSize: 13, color: colors.homeBlue },
  splash: { position: "absolute", inset: 0 as any, backgroundColor: colors.homeBg, alignItems: "center", justifyContent: "center", zIndex: 100 },
});
