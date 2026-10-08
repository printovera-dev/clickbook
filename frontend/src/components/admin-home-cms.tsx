// Admin → Home Page: edit sliders (add / replace image / text / CTA / order / enable / delete), hero images and videos.
// Saves the whole document via PUT /admin/home; the app fetches GET /home so changes show without a rebuild.
import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Switch, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@react-native-vector-icons/feather";
import { api, fileUrl } from "@/src/api";
import { Thumb } from "@/src/components/thumb";
import { Button, s } from "@/src/ui";
import { colors, spacing, radius, fonts } from "@/src/theme";

const ROUTES = ["", "/create/cover", "/(tabs)/orders", "/policy/privacy", "/policy/faq"];
const TAB_LABELS: Record<string, string> = { slider1: "Slider 1", slider2: "Slider 2", slider3: "Slider 3", heroes: "Hero images", videos: "Videos", brand: "Logo & back cover", accordions: "Accordions", promo: "Promo popup" };
const SLIDERS = ["slider1", "slider2", "slider3"];

async function pickImage(): Promise<any | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to upload images."); return null; }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false, base64: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const r = await api.adminUploadImage(a.uri, a.fileName || `home_${Date.now()}.jpg`, (a as any).file);
  return r.image;
}

async function pickVideo(): Promise<any | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert("Permission needed", "Allow media access to upload videos."); return null; }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 1, base64: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const r = await api.adminUploadVideo(a.uri, a.fileName || `home_${Date.now()}.mp4`, (a as any).file);
  return r.video;
}

export function AdminHomeCms({ title, tabs }: { title: string; tabs: string[] }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [doc, setDoc] = useState<any | null>(null);
  const [tab, setTab] = useState<string>(tabs[0]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.adminHome().then((r) => setDoc(r.content)).catch((e) => setMsg(e.message)); }, []);

  const save = async () => {
    if (!doc) return;
    setSaving(true); setMsg("");
    try {
      const r = await api.adminUpdateHome({ sliders: doc.sliders, heroes: doc.heroes, videos: doc.videos, texts: doc.texts, logo_url: doc.logo_url, last_page_url: doc.last_page_url, accordions: doc.accordions, promo_popup: doc.promo_popup });
      setDoc(r.content); setMsg("Saved — live in the app now ✓");
    } catch (e: any) { setMsg(e.message || "Save failed"); } finally { setSaving(false); }
  };

  const [offers, setOffers] = useState<any[]>([]);
  useEffect(() => { if (tabs.includes("promo")) api.adminOffers().then((r) => setOffers(r.offers)).catch(() => {}); }, [tabs]);
  const promo = doc?.promo_popup || {};
  const setPromo = (p: any) => setDoc({ ...doc, promo_popup: { ...promo, ...p } });
  const setAcc = (i: number, p: any) => setDoc({ ...doc, accordions: doc.accordions.map((a: any, j: number) => (j === i ? { ...a, ...p } : a)) });
  const setAccItem = (i: number, ii: number, p: any) => setAcc(i, { items: doc.accordions[i].items.map((it: any, j: number) => (j === ii ? { ...it, ...p } : it)) });
  const removeAcc = (i: number) => {
    const doIt = () => setDoc({ ...doc, accordions: doc.accordions.filter((_: any, j: number) => j !== i) });
    if (Platform.OS === "web") { if (window.confirm("Delete this accordion row?")) doIt(); return; }
    Alert.alert("Delete row?", "", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: doIt }]);
  };
  const slides: any[] = doc?.sliders?.[tab]?.slides || [];
  const setSlides = (next: any[]) => setDoc({ ...doc, sliders: { ...doc.sliders, [tab]: { ...(doc.sliders[tab] || {}), slides: next.map((sl, i) => ({ ...sl, order: i + 1 })) } } });
  const patch = (i: number, p: any) => setSlides(slides.map((sl, j) => (j === i ? { ...sl, ...p } : sl)));
  const move = (i: number, d: number) => { const n = [...slides]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setSlides(n); };
  const replaceImage = async (i: number) => { const img = await pickImage(); if (img) patch(i, { image_url: img.url }); };
  const addSlide = async () => { const img = await pickImage(); if (img) setSlides([...slides, { id: `${Date.now()}`, type: "image", image_url: img.url, title: "", subtitle: "", cta_label: "", cta_route: "", active: true }]); };
  const addVideoSlide = async () => {
    setMsg("Uploading video…");
    try { const v = await pickVideo(); setMsg(""); if (v) setSlides([...slides, { id: `${Date.now()}`, type: "video", video_url: v.url, image_url: "", title: "", subtitle: "", cta_label: "", cta_route: "", active: true }]); }
    catch (e: any) { setMsg(e.message || "Video upload failed"); }
  };
  const replaceVideo = async (i: number) => { setMsg("Uploading video…"); try { const v = await pickVideo(); setMsg(""); if (v) patch(i, { type: "video", video_url: v.url }); } catch (e: any) { setMsg(e.message || "Video upload failed"); } };
  const remove = (i: number) => {
    const doIt = () => setSlides(slides.filter((_, j) => j !== i));
    if (Platform.OS === "web") { if (window.confirm("Delete this slide?")) doIt(); return; }
    Alert.alert("Delete slide?", "", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: doIt }]);
  };

  const heroes: any[] = doc?.heroes || [];
  const replaceHero = async (id: string) => { const img = await pickImage(); if (img) setDoc({ ...doc, heroes: heroes.map((h) => (h.id === id ? { ...h, image_url: img.url } : h)) }); };
  const videos: any[] = doc?.videos || [];
  const setVideos = (v: any[]) => setDoc({ ...doc, videos: v.map((x, i) => ({ ...x, order: i + 1 })) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} testID="admin-home-back" hitSlop={12}><Feather name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.label}>{title}</Text>
        <View style={{ width: 22 }} />
      </View>
      {tabs.length > 1 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }} style={{ maxHeight: 48 }}>
        {tabs.map((k) => (
          <Pressable key={k} testID={`admin-home-tab-${k}`} onPress={() => setTab(k)} style={[styles.chip, tab === k && styles.chipActive]}>
            <Text style={[styles.chipTxt, tab === k && { color: colors.onBrandPrimary }]}>{TAB_LABELS[k] || k}</Text>
          </Pressable>
        ))}
      </ScrollView>
      ) : null}
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {!doc ? <Text style={s.bodyMuted}>{msg || "Loading…"}</Text> : null}

        {doc && tab === "brand" ? (
          <>
            <View style={styles.card} testID="admin-brand-logo">
              <Text style={s.h2}>App logo</Text>
              <Text style={s.bodyMuted}>Shown in the home page header.</Text>
              <Thumb uri={fileUrl(doc.logo_url)} recyclingKey="logo" style={{ width: 220, height: 80, borderRadius: radius.sm, marginTop: spacing.sm }} />
              <Pressable onPress={async () => { const img = await pickImage(); if (img) setDoc({ ...doc, logo_url: img.url }); }} style={[styles.miniBtn, { marginTop: spacing.sm, alignSelf: "flex-start" }]} testID="admin-brand-logo-replace"><Feather name="image" size={14} color={colors.brandPrimary} /><Text style={styles.miniTxt}>Replace logo</Text></Pressable>
            </View>
            <View style={styles.card} testID="admin-brand-last-page">
              <Text style={s.h2}>Album back cover</Text>
              <Text style={s.bodyMuted}>Fixed back cover printed on every ClickBook (3D preview + Album.pdf + Cover/back_cover.jpg). Upload a square image, ideally 2400×2400 px.</Text>
              <Thumb uri={fileUrl(doc.last_page_url)} recyclingKey="last-page" style={{ width: 200, height: 200, borderRadius: radius.sm, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border }} />
              <Pressable onPress={async () => { const img = await pickImage(); if (img) setDoc({ ...doc, last_page_url: img.original_url || img.url }); }} style={[styles.miniBtn, { marginTop: spacing.sm, alignSelf: "flex-start" }]} testID="admin-brand-last-page-replace"><Feather name="upload" size={14} color={colors.brandPrimary} /><Text style={styles.miniTxt}>Upload back cover</Text></Pressable>
            </View>
          </>
        ) : null}

        {doc && SLIDERS.includes(tab) ? (
          <>
            {slides.map((sl, i) => (
              <View key={sl.id} style={styles.card} testID={`admin-slide-${sl.id}`}>
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <View style={{ width: tab === "slider1" ? 72 : 128, height: tab === "slider1" ? 108 : 72, borderRadius: radius.sm, overflow: "hidden", backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" }}>
                    {sl.image_url ? <Thumb uri={fileUrl(sl.image_url)} recyclingKey={sl.id} style={{ width: "100%", height: "100%" }} /> : <Feather name="video" size={22} color={colors.muted} />}
                    {sl.type === "video" ? <View style={styles.playTag}><Feather name="play" size={10} color="#FFF" /></View> : null}
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={s.bodyMuted}>Slide {i + 1} · {sl.type === "video" ? "video" : "image"}{sl.active ? "" : " · hidden"}</Text>
                    <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
                      <Pressable onPress={() => replaceImage(i)} testID={`admin-slide-replace-${sl.id}`} style={styles.miniBtn}><Feather name="image" size={14} color={colors.brandPrimary} /><Text style={styles.miniTxt}>{sl.type === "video" ? "Poster" : "Replace"}</Text></Pressable>
                      {sl.type === "video" ? <Pressable onPress={() => replaceVideo(i)} testID={`admin-slide-replace-video-${sl.id}`} style={styles.miniBtn}><Feather name="video" size={14} color={colors.brandPrimary} /><Text style={styles.miniTxt}>Video</Text></Pressable> : null}
                      <Pressable onPress={() => move(i, -1)} style={styles.miniBtn}><Feather name="arrow-up" size={14} color={colors.onSurface} /></Pressable>
                      <Pressable onPress={() => move(i, 1)} style={styles.miniBtn}><Feather name="arrow-down" size={14} color={colors.onSurface} /></Pressable>
                      <Pressable onPress={() => remove(i)} testID={`admin-slide-delete-${sl.id}`} style={styles.miniBtn}><Feather name="trash-2" size={14} color={colors.error} /></Pressable>
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                  <Text style={s.body}>Enabled</Text>
                  <Switch value={sl.active !== false} onValueChange={(v) => patch(i, { active: v })} trackColor={{ true: colors.brandPrimary }} testID={`admin-slide-active-${sl.id}`} />
                </View>
                <TextInput value={sl.title || ""} onChangeText={(v) => patch(i, { title: v })} placeholder="Title (optional)" placeholderTextColor={colors.muted} style={styles.input} testID={`admin-slide-title-${sl.id}`} />
                <TextInput value={sl.subtitle || ""} onChangeText={(v) => patch(i, { subtitle: v })} placeholder="Subtitle (optional)" placeholderTextColor={colors.muted} style={styles.input} />
                <TextInput value={sl.cta_label || ""} onChangeText={(v) => patch(i, { cta_label: v })} placeholder="Button label (optional)" placeholderTextColor={colors.muted} style={styles.input} />
                <Text style={[s.bodyMuted, { marginTop: spacing.sm }]}>Button destination</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 6 }}>
                  {ROUTES.map((r) => (
                    <Pressable key={r || "none"} onPress={() => patch(i, { cta_route: r })} style={[styles.chip, (sl.cta_route || "") === r && styles.chipActive]}>
                      <Text style={[styles.chipTxt, (sl.cta_route || "") === r && { color: colors.onBrandPrimary }]}>{r || "none"}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}
            {tab === "slider1" ? <Text style={[s.bodyMuted, { marginBottom: spacing.sm }]}>Slider 1 is vertical: upload portrait artwork (2:3, e.g. 1000 × 1500 px). Images are shown complete, never cropped.</Text> : null}
            <Button testID="admin-slide-add" label="+ Add image slide" variant="outline" onPress={addSlide} />
            <Button testID="admin-slide-add-video" label="+ Add video slide (MP4, max 60MB)" variant="outline" onPress={addVideoSlide} style={{ marginTop: spacing.sm }} />
          </>
        ) : null}

        {doc && tab === "accordions" ? (
          <>
            <Text style={[s.bodyMuted, { marginBottom: spacing.sm }]}>Expandable rows shown under “Why ClickBook”. Row types: label/value pairs, bullet points or plain text.</Text>
            {(doc.accordions || []).map((a: any, ai: number) => (
              <View key={a.id} style={styles.card} testID={`admin-accordion-${a.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <TextInput value={a.title} onChangeText={(v) => setAcc(ai, { title: v })} placeholder="Row title" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1, marginTop: 0 }]} testID={`admin-accordion-title-${a.id}`} />
                  <Switch value={a.active !== false} onValueChange={(v) => setAcc(ai, { active: v })} trackColor={{ true: colors.brandPrimary }} />
                  <Pressable onPress={() => removeAcc(ai)} style={styles.miniBtn} testID={`admin-accordion-delete-${a.id}`}><Feather name="trash-2" size={14} color={colors.error} /></Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                  {(["pairs", "bullets", "text"] as const).map((ty) => (
                    <Pressable key={ty} onPress={() => setAcc(ai, { type: ty })} style={[styles.chip, a.type === ty && styles.chipActive]}><Text style={[styles.chipTxt, a.type === ty && { color: colors.onBrandPrimary }]}>{ty === "pairs" ? "Label / value" : ty === "bullets" ? "Bullets" : "Text"}</Text></Pressable>
                  ))}
                </View>
                {(a.items || []).map((it: any, ii: number) => (
                  <View key={ii} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                    {a.type === "pairs" ? <TextInput value={it.label || ""} onChangeText={(v) => setAccItem(ai, ii, { label: v })} placeholder="Label" placeholderTextColor={colors.muted} style={[styles.input, { flex: 0.8 }]} /> : null}
                    <TextInput value={it.value || ""} onChangeText={(v) => setAccItem(ai, ii, { value: v })} placeholder={a.type === "pairs" ? "Value" : "Text"} placeholderTextColor={colors.muted} multiline style={[styles.input, { flex: 1.4 }]} testID={`admin-accordion-item-${a.id}-${ii}`} />
                    <Pressable onPress={() => setAcc(ai, { items: a.items.filter((_: any, j: number) => j !== ii) })} hitSlop={8} style={{ marginTop: spacing.sm }}><Feather name="x" size={16} color={colors.muted} /></Pressable>
                  </View>
                ))}
                <Pressable onPress={() => setAcc(ai, { items: [...(a.items || []), { label: "", value: "" }] })} style={[styles.miniBtn, { marginTop: spacing.sm, alignSelf: "flex-start" }]} testID={`admin-accordion-add-item-${a.id}`}><Feather name="plus" size={14} color={colors.brandPrimary} /><Text style={styles.miniTxt}>Add item</Text></Pressable>
              </View>
            ))}
            <Button testID="admin-accordion-add" label="+ Add accordion row" variant="outline" onPress={() => setDoc({ ...doc, accordions: [...(doc.accordions || []), { id: `${Date.now()}`, title: "New row", type: "bullets", active: true, order: (doc.accordions || []).length + 1, items: [{ value: "" }] }] })} />
          </>
        ) : null}

        {doc && tab === "promo" ? (
          <View style={styles.card} testID="admin-promo">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={s.h2}>Promotional offer popup</Text>
                <Text style={s.bodyMuted}>Shown centred when a visitor opens the site. Off = never shown.</Text>
              </View>
              <Switch value={!!promo.enabled} onValueChange={(v) => setPromo({ enabled: v })} trackColor={{ true: colors.brandPrimary }} testID="admin-promo-enabled" />
            </View>
            <Text style={[s.label, { marginTop: spacing.md }]}>Offer code (from Offers / Coupons)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 6 }}>
              {offers.map((o: any) => (
                <Pressable key={o.id} onPress={() => setPromo({ offer_code: o.code })} style={[styles.chip, promo.offer_code === o.code && styles.chipActive]} testID={`admin-promo-offer-${o.code}`}>
                  <Text style={[styles.chipTxt, promo.offer_code === o.code && { color: colors.onBrandPrimary }]}>{o.code}{o.active ? "" : " (inactive)"}</Text>
                </Pressable>
              ))}
              {!offers.length ? <Text style={s.bodyMuted}>No offers yet — create one under Offers / Coupons.</Text> : null}
            </ScrollView>
            <TextInput value={promo.title || ""} onChangeText={(v) => setPromo({ title: v })} placeholder="Popup title" placeholderTextColor={colors.muted} style={styles.input} testID="admin-promo-title" />
            <TextInput value={promo.text || ""} onChangeText={(v) => setPromo({ text: v })} placeholder="Offer details (optional — discount & validity are added automatically)" placeholderTextColor={colors.muted} multiline style={styles.input} testID="admin-promo-text" />
            <TextInput value={promo.button_label || ""} onChangeText={(v) => setPromo({ button_label: v })} placeholder="Button label (default: Copy code)" placeholderTextColor={colors.muted} style={styles.input} />
          </View>
        ) : null}

        {doc && tab === "heroes" ? heroes.map((h) => (
          <View key={h.id} style={styles.card} testID={`admin-hero-${h.key}`}>
            <Text style={s.h2}>{h.key} image</Text>
            <Thumb uri={fileUrl(h.image_url)} recyclingKey={h.id} style={{ width: "100%", height: 150, borderRadius: radius.sm, marginTop: spacing.sm }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
              <Pressable onPress={() => replaceHero(h.id)} style={styles.miniBtn} testID={`admin-hero-replace-${h.key}`}><Feather name="image" size={14} color={colors.brandPrimary} /><Text style={styles.miniTxt}>Replace image</Text></Pressable>
              <Switch value={h.active !== false} onValueChange={(v) => setDoc({ ...doc, heroes: heroes.map((x) => (x.id === h.id ? { ...x, active: v } : x)) })} trackColor={{ true: colors.brandPrimary }} />
            </View>
          </View>
        )) : null}

        {doc && tab === "videos" ? (
          <>
            {videos.map((v, i) => (
              <View key={v.id} style={styles.card} testID={`admin-video-${v.id}`}>
                <TextInput value={v.url} onChangeText={(x) => setVideos(videos.map((y, j) => (j === i ? { ...y, url: x } : y)))} placeholder="YouTube / Vimeo URL" placeholderTextColor={colors.muted} autoCapitalize="none" style={styles.input} />
                <TextInput value={v.title} onChangeText={(x) => setVideos(videos.map((y, j) => (j === i ? { ...y, title: x } : y)))} placeholder="Title" placeholderTextColor={colors.muted} style={styles.input} />
                <TextInput value={v.description || ""} onChangeText={(x) => setVideos(videos.map((y, j) => (j === i ? { ...y, description: x } : y)))} placeholder="Short description" placeholderTextColor={colors.muted} style={styles.input} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                  <Switch value={v.active !== false} onValueChange={(x) => setVideos(videos.map((y, j) => (j === i ? { ...y, active: x } : y)))} trackColor={{ true: colors.brandPrimary }} />
                  <Pressable onPress={() => setVideos(videos.filter((_, j) => j !== i))} style={styles.miniBtn}><Feather name="trash-2" size={14} color={colors.error} /><Text style={[styles.miniTxt, { color: colors.error }]}>Remove</Text></Pressable>
                </View>
              </View>
            ))}
            <Button label="+ Add video" variant="outline" onPress={() => setVideos([...videos, { id: `${Date.now()}`, url: "", title: "", description: "", active: true }])} />
          </>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {msg ? <Text style={[s.bodyMuted, { marginBottom: spacing.sm, textAlign: "center" }]} testID="admin-home-msg">{msg}</Text> : null}
        <Button testID="admin-home-save" label="Save & publish" onPress={save} loading={saving} disabled={!doc} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  playTag: { position: "absolute", right: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.xl },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontFamily: fonts.text, fontSize: 12 },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  miniTxt: { fontFamily: fonts.text, fontSize: 12, color: colors.brandPrimary },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surface },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
