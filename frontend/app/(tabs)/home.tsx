import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@react-native-vector-icons/feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const C = {
  ivory: "#FAF8F2",
  sage: "#EEF1E8",
  sageDeep: "#DDE5D8",
  forest: "#183F35",
  forest2: "#245548",
  ink: "#23352F",
  muted: "#69756D",
  border: "#E4E5DC",
  white: "#FFFFFF",
  gold: "#B99A5B",
};

const categories = ["Photo Albums", "Frames & Acrylic", "Canvas & Collages", "Visiting Cards", "Wedding Cards", "Business Printing"];
const categoryKinds: Record<string, string> = {
  "Frames & Acrylic": "Acrylic Photo",
  "Canvas & Collages": "Canvas Print",
  "Visiting Cards": "Visiting Cards",
  "Wedding Cards": "Wedding Cards",
  "Business Printing": "Brochures",
};
const products = [
  { title: "Wedding Albums", desc: "Premium albums made to keep forever", image: "https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=900&q=80", route: "album" },
  { title: "Photo Frames", desc: "Frame a favourite moment", image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=900&q=80", route: "Framed Photo" },
  { title: "Acrylic Frames", desc: "Modern, glossy statement pieces", image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=900&q=80", route: "Acrylic Photo" },
  { title: "Photo Collages", desc: "Bring your best memories together", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80", route: "Photo Collage" },
  { title: "Canvas Prints", desc: "Gallery-style art for your walls", image: "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=900&q=80", route: "Canvas Print" },
  { title: "Visiting Cards", desc: "Professional cards for your business", image: "https://images.unsplash.com/photo-1589330694653-ded6df03f754?auto=format&fit=crop&w=900&q=80", route: "Visiting Cards" },
  { title: "Wedding Cards", desc: "A beautiful first impression", image: "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=900&q=80", route: "Wedding Cards" },
  { title: "Business Printing", desc: "Branded print essentials", image: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=900&q=80", route: "Brochures" },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const wide = width >= 900;
  const cols = width >= 1100 ? 4 : width >= 650 ? 2 : 1;
  const gap = 16;
  const cardWidth = cols === 1 ? width - 40 : (Math.min(width, 1200) - 40 - gap * (cols - 1)) / cols;

  const go = (route: string) => {
    setMenuOpen(false);
    if (route === "album") router.push("/wedding-album" as any);
    else router.push("/(tabs)/print-studio" as any);
  };

  return (
    <View style={s.page}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
          <View style={[s.headerInner, { maxWidth: 1200 }]}>
            <Pressable accessibilityLabel="Open navigation" onPress={() => setMenuOpen(!menuOpen)} style={s.menuBtn}>
              <Feather name={menuOpen ? "x" : "menu"} size={21} color={C.forest} />
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)/home" as any)} accessibilityLabel="Printovera home">
              <Text style={s.logo}>PRINTOVERA</Text>
              <Text style={s.logoSub}>PRINTS THAT HOLD MEANING</Text>
            </Pressable>
            <Pressable accessibilityLabel="Open print studio" onPress={() => go("print")} style={s.bagBtn}>
              <Feather name="shopping-bag" size={20} color={C.forest} />
            </Pressable>
          </View>
          {menuOpen ? (
            <View style={s.menuPanel}>
              {categories.map((item) => <Pressable key={item} onPress={() => go(item === "Photo Albums" ? "album" : (categoryKinds[item] || "Acrylic Photo"))} style={s.menuItem}><Text style={s.menuText}>{item}</Text><Feather name="arrow-up-right" size={16} color={C.forest} /></Pressable>)}
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.nav}>
            {categories.map((item) => <Pressable key={item} onPress={() => go(item === "Photo Albums" ? "album" : "print")} style={s.navItem}><Text style={s.navText}>{item}</Text></Pressable>)}
          </ScrollView>
        </View>

        <View style={[s.heroWrap, { maxWidth: 1200, alignSelf: "center", width: "100%", paddingHorizontal: 20 }]}>
          <View style={[s.hero, wide && s.heroWide]}>
            <View style={[s.heroCopy, wide && { flex: 0.85 }]}>
              <Text style={s.eyebrow}>YOUR PHOTOS, YOUR STORY</Text>
              <Text style={s.heroTitle}>Make your memories tangible.</Text>
              <Text style={s.heroText}>Create premium photo albums, beautiful wall art and personalised print products online.</Text>
              <Pressable onPress={() => go("print")} style={s.primaryBtn} testID="printovera-explore-products">
                <Text style={s.primaryBtnText}>Explore Products</Text><Feather name="arrow-right" size={18} color={C.white} />
              </Pressable>
              <View style={s.trustRow}><Feather name="check-circle" size={15} color={C.forest2} /><Text style={s.trustText}>Made personal. Printed with care.</Text></View>
            </View>
            <View style={[s.heroImageWrap, wide && { flex: 1.15 }]}>
              <Image source={{ uri: "https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1400&q=85" }} style={s.heroImage} contentFit="cover" transition={250} />
              <View style={s.imageCaption}><Text style={s.captionTop}>THE ART OF KEEPING</Text><Text style={s.captionTitle}>Moments, made lasting.</Text></View>
            </View>
          </View>
        </View>

        <View style={[s.section, { maxWidth: 1200, alignSelf: "center", width: "100%" }]}>
          <View style={s.sectionHeading}>
            <View><Text style={s.eyebrow}>MADE FOR YOUR MOMENTS</Text><Text style={s.sectionTitle}>Explore our products</Text></View>
            <Pressable onPress={() => go("print")} style={s.textLink}><Text style={s.textLinkText}>View all products</Text><Feather name="arrow-up-right" size={16} color={C.forest} /></Pressable>
          </View>
          <View style={s.productGrid}>
            {products.map((p) => (
              <Pressable key={p.title} onPress={() => go(p.route)} style={[s.productCard, { width: cardWidth }]} testID={"product-" + p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}>
                <View style={s.productImageWrap}><Image source={{ uri: p.image }} style={s.productImage} contentFit="cover" transition={200} /><View style={s.productArrow}><Feather name="arrow-up-right" size={18} color={C.forest} /></View></View>
                <View style={s.productInfo}><Text style={s.productTitle}>{p.title}</Text><Text style={s.productDesc}>{p.desc}</Text></View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[s.studioBanner, { maxWidth: 1160, alignSelf: "center", width: "100%" }]}>
          <View style={s.studioCopy}><Text style={s.eyebrow}>FOR YOUR BIGGEST CHAPTER</Text><Text style={s.studioTitle}>Your wedding story deserves its own book.</Text><Text style={s.studioText}>Build your album, choose your size and finish, and organise your photographs in the Wedding Album Studio.</Text><Pressable onPress={() => go("album")} style={s.lightBtn} testID="open-wedding-album-studio"><Text style={s.lightBtnText}>Open Wedding Album Studio</Text><Feather name="arrow-right" size={17} color={C.forest} /></Pressable></View>
          <Image source={{ uri: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1000&q=80" }} style={s.studioImage} contentFit="cover" />
        </View>

        <View style={[s.footer, { maxWidth: 1200, alignSelf: "center", width: "100%" }]}>
          <View><Text style={s.footerLogo}>PRINTOVERA</Text><Text style={s.footerText}>Your photos. Your story. Beautifully printed.</Text></View>
          <View style={s.footerLinks}>{categories.map((item) => <Pressable key={item} onPress={() => go(item === "Photo Albums" ? "album" : "print")}><Text style={s.footerLink}>{item}</Text></Pressable>)}</View>
          <Text style={s.copyright}>© {new Date().getFullYear()} Printovera LLP</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.ivory },
  header: { backgroundColor: C.ivory, borderBottomWidth: 1, borderBottomColor: C.border },
  headerInner: { width: "100%", alignSelf: "center", paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  menuBtn: { width: 42, height: 42, borderRadius: 22, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  bagBtn: { width: 42, height: 42, borderRadius: 22, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  logo: { fontSize: 23, fontWeight: "800", letterSpacing: 1.1, color: C.forest, textAlign: "center" },
  logoSub: { fontSize: 8, letterSpacing: 2, color: C.muted, textAlign: "center", marginTop: 3 },
  nav: { justifyContent: "center", alignItems: "center", gap: 32, paddingHorizontal: 22, paddingVertical: 15, alignSelf: "center" },
  navItem: { paddingVertical: 2 },
  navText: { fontSize: 13, color: C.ink, fontWeight: "500" },
  menuPanel: { marginHorizontal: 20, marginBottom: 12, padding: 8, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  menuItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12 },
  menuText: { color: C.forest, fontSize: 14 },
  heroWrap: { paddingTop: 24 },
  hero: { borderRadius: 22, backgroundColor: C.sage, overflow: "hidden" },
  heroWide: { flexDirection: "row", alignItems: "stretch" },
  heroCopy: { padding: 30, justifyContent: "center" },
  eyebrow: { color: C.forest2, fontSize: 10, fontWeight: "700", letterSpacing: 1.7, marginBottom: 13 },
  heroTitle: { color: C.forest, fontSize: 39, lineHeight: 45, fontWeight: "600", letterSpacing: -1.1, maxWidth: 520 },
  heroText: { color: "#52635A", fontSize: 15, lineHeight: 24, marginTop: 14, maxWidth: 490 },
  primaryBtn: { marginTop: 23, minHeight: 50, paddingHorizontal: 20, borderRadius: 8, backgroundColor: C.forest, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, alignSelf: "flex-start" },
  primaryBtnText: { color: C.white, fontWeight: "600", fontSize: 14 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 },
  trustText: { color: C.muted, fontSize: 12 },
  heroImageWrap: { minHeight: 290, flex: 1, position: "relative" },
  heroImage: { width: "100%", height: "100%", minHeight: 290 },
  imageCaption: { position: "absolute", bottom: 18, left: 18, right: 18, padding: 16, borderRadius: 10, backgroundColor: "rgba(250,248,242,0.91)" },
  captionTop: { color: C.forest2, fontSize: 9, letterSpacing: 1.6, fontWeight: "700" },
  captionTitle: { color: C.forest, fontSize: 19, fontWeight: "600", marginTop: 4 },
  section: { paddingHorizontal: 20, paddingTop: 46 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, paddingHorizontal: 2 },
  sectionTitle: { color: C.forest, fontSize: 29, fontWeight: "600", letterSpacing: -0.5 },
  textLink: { flexDirection: "row", alignItems: "center", gap: 5, paddingBottom: 4 },
  textLinkText: { color: C.forest, fontSize: 13, fontWeight: "600" },
  productGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 16 },
  productCard: { borderRadius: 14, overflow: "hidden", backgroundColor: C.white, borderWidth: 1, borderColor: C.border, marginBottom: 2 },
  productImageWrap: { height: 205, backgroundColor: C.sageDeep, position: "relative" },
  productImage: { width: "100%", height: "100%" },
  productArrow: { position: "absolute", right: 12, bottom: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: C.ivory, alignItems: "center", justifyContent: "center" },
  productInfo: { paddingHorizontal: 16, paddingVertical: 15 },
  productTitle: { color: C.forest, fontSize: 17, fontWeight: "600" },
  productDesc: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  studioBanner: { marginTop: 48, marginHorizontal: 20, backgroundColor: C.forest, borderRadius: 20, overflow: "hidden", flexDirection: "row", minHeight: 270 },
  studioCopy: { flex: 1, padding: 28, justifyContent: "center" },
  studioTitle: { color: C.white, fontSize: 29, lineHeight: 35, fontWeight: "600", maxWidth: 470 },
  studioText: { color: "#E0E9E2", fontSize: 13, lineHeight: 21, marginTop: 12, maxWidth: 480 },
  lightBtn: { alignSelf: "flex-start", marginTop: 20, backgroundColor: C.ivory, borderRadius: 8, paddingVertical: 13, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  lightBtnText: { color: C.forest, fontSize: 13, fontWeight: "700" },
  studioImage: { width: "38%", minHeight: 270 },
  footer: { paddingHorizontal: 22, paddingVertical: 34, marginTop: 38, borderTopWidth: 1, borderTopColor: C.border, gap: 16 },
  footerLogo: { color: C.forest, fontSize: 20, fontWeight: "800", letterSpacing: 1.1 },
  footerText: { color: C.muted, fontSize: 12, marginTop: 5 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  footerLink: { color: C.ink, fontSize: 12 },
  copyright: { color: C.muted, fontSize: 11, marginTop: 8 },
});
