import { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text, TextInput, StyleSheet, Switch } from "react-native";
import { AdminPage } from "@/src/components/admin-page";
import { Button, s } from "@/src/ui";
import { api } from "@/src/api";
import { colors, spacing, radius, fonts } from "@/src/theme";

const money = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const initial = {
  moulding_rates_per_inch: { Black: 20, "Natural oak": 24, Walnut: 28, Gold: 30, White: 20, Silver: 26 },
  glass_per_sqft: 100, manufacturing_per_sqft: 80,
  print_rates_per_sqft: { "Photo paper": 60, Canvas: 180, "Acrylic print": 220 },
  finish_rates_per_sqft: { Gloss: 15, Matte: 25, Lustre: 20, "Textured canvas": 35, None: 0 },
  backing_per_sqft: 20, wastage_percent: 10, profit_margin_percent: 30, pricing_gst_percent: 18,
  glass_enabled: true, backing_enabled: true,
};

export default function FramePricingEngine() {
  const [cfg, setCfg] = useState<any>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [width, setWidth] = useState("12");
  const [height, setHeight] = useState("18");
  const [moulding, setMoulding] = useState("Black");
  const [material, setMaterial] = useState("Photo paper");
  const [finish, setFinish] = useState("Gloss");
  const [quote, setQuote] = useState<any>(null);
  const [quoteError, setQuoteError] = useState("");

  useEffect(() => {
    api.adminFramePricing().then(r => setCfg({ ...initial, ...r.pricing })).catch(e => setNotice(e.message || "Could not load pricing settings")).finally(() => setLoading(false));
  }, []);

  const setScalar = (key: string, value: string) => setCfg((c: any) => ({ ...c, [key]: value === "" ? 0 : Number(value) }));
  const setRate = (group: string, key: string, value: string) => setCfg((c: any) => ({ ...c, [group]: { ...c[group], [key]: value === "" ? 0 : Number(value) } }));
  const fields = [
    ["glass_per_sqft", "Glass price (₹ / sq. ft.)"],
    ["manufacturing_per_sqft", "Manufacturing (₹ / sq. ft.)"],
    ["backing_per_sqft", "Backing (₹ / sq. ft.)"],
    ["wastage_percent", "Wastage (%)"],
    ["profit_margin_percent", "Target profit margin (%)"],
    ["pricing_gst_percent", "GST (%)"],
  ];
  const validQuote = useMemo(() => Number(width) > 0 && Number(height) > 0, [width, height]);

  async function save() {
    setSaving(true); setNotice("");
    try { const r = await api.adminUpdateFramePricing(cfg); setCfg({ ...initial, ...r.pricing }); setNotice("Pricing rates saved successfully."); }
    catch (e: any) { setNotice(e.message || "Unable to save pricing rates."); }
    finally { setSaving(false); }
  }

  async function calculate() {
    setQuote(null); setQuoteError("");
    try {
      const r = await api.calculateFramePrice({ width_in: Number(width), height_in: Number(height), product_type: "framed_photo", moulding, print_material: material, finish });
      setQuote(r);
    } catch (e: any) { setQuoteError(e.message || "Unable to calculate price."); }
  }

  return (
    <AdminPage title="Frame pricing engine" testID="admin-frame-pricing">
      <Text style={s.bodyMuted}>Set rates here. The backend stores them in the existing settings document; no database migration or new storage service is required.</Text>
      <Text style={[s.h2, { marginTop: spacing.xl }]}>Moulding rates · per running inch</Text>
      {Object.entries(cfg.moulding_rates_per_inch || {}).map(([name, value]) => (
        <Field key={name} label={name} value={String(value)} onChange={v => setRate("moulding_rates_per_inch", name, v)} />
      ))}
      <Text style={[s.h2, { marginTop: spacing.xl }]}>Material and production rates</Text>
      {fields.slice(0, 3).map(([key, label]) => <Field key={key} label={label} value={String(cfg[key] ?? 0)} onChange={v => setScalar(key, v)} />)}
      <Toggle label="Charge glass for framed photos" value={!!cfg.glass_enabled} onChange={v => setCfg((c: any) => ({ ...c, glass_enabled: v }))} />
      <Toggle label="Charge backing for framed photos" value={!!cfg.backing_enabled} onChange={v => setCfg((c: any) => ({ ...c, backing_enabled: v }))} />
      <Text style={[s.h2, { marginTop: spacing.xl }]}>Print material · per sq. ft.</Text>
      {Object.entries(cfg.print_rates_per_sqft || {}).map(([name, value]) => (
        <Field key={name} label={name} value={String(value)} onChange={v => setRate("print_rates_per_sqft", name, v)} />
      ))}
      <Text style={[s.h2, { marginTop: spacing.xl }]}>Finish rates · per sq. ft.</Text>
      {Object.entries(cfg.finish_rates_per_sqft || {}).map(([name, value]) => (
        <Field key={name} label={name === "None" ? "No extra finish charge" : name} value={String(value)} onChange={v => setRate("finish_rates_per_sqft", name, v)} />
      ))}
      <Text style={[s.h2, { marginTop: spacing.xl }]}>Wastage, margin and tax</Text>
      {fields.slice(3).map(([key, label]) => <Field key={key} label={label} value={String(cfg[key] ?? 0)} onChange={v => setScalar(key, v)} />)}
      <Button testID="frame-pricing-save" label={saving ? "Saving…" : "Save pricing rates"} onPress={save} disabled={saving || loading} style={{ marginTop: spacing.lg }} />
      {notice ? <Text accessibilityRole="alert" style={[s.body, { marginTop: spacing.md, color: notice.includes("successfully") ? "#16834A" : colors.error }]}>{notice}</Text> : null}
      <View style={styles.quoteBox}>
        <Text style={s.h2}>Test a frame quote</Text>
        <Text style={[s.bodyMuted, { marginTop: 4 }]}>This uses the current saved backend rates. Dimensions are in inches.</Text>
        <Field label="Width (in)" value={width} onChange={setWidth} />
        <Field label="Height (in)" value={height} onChange={setHeight} />
        <Text style={styles.label}>Moulding</Text>
        <View style={styles.chips}>{Object.keys(cfg.moulding_rates_per_inch || {}).map(name => <Button key={name} label={name} size="sm" variant={moulding === name ? "solid" : "outline"} onPress={() => setMoulding(name)} />)}</View>
        <Text style={styles.label}>Print material</Text>
        <View style={styles.chips}>{Object.keys(cfg.print_rates_per_sqft || {}).map(name => <Button key={name} label={name} size="sm" variant={material === name ? "solid" : "outline"} onPress={() => setMaterial(name)} />)}</View>
        <Text style={styles.label}>Finish</Text>
        <View style={styles.chips}>{Object.keys(cfg.finish_rates_per_sqft || {}).map(name => <Button key={name} label={name} size="sm" variant={finish === name ? "solid" : "outline"} onPress={() => setFinish(name)} />)}</View>
        <Button label="Calculate from saved rates" onPress={calculate} disabled={!validQuote} style={{ marginTop: spacing.md }} />
        {quoteError ? <Text accessibilityRole="alert" style={[s.body, { color: colors.error, marginTop: spacing.md }]}>{quoteError}</Text> : null}
        {quote ? <View style={styles.result}>
          <Text style={s.label}>Calculated total including tax</Text>
          <Text style={styles.total}>{money(quote.total)}</Text>
          <Text style={s.bodyMuted}>{quote.area_sqft} sq. ft. · {quote.perimeter_in} running inches · quantity {quote.quantity}</Text>
          {Object.entries(quote.breakdown_per_unit || {}).map(([key, value]) => <View key={key} style={styles.breakdown}><Text style={s.bodyMuted}>{key.replace(/_/g, " ")}</Text><Text style={s.body}>{money(Number(value))}</Text></View>)}
        </View> : null}
      </View>
    </AdminPage>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={{ marginTop: spacing.md }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" style={styles.input} />
  </View>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggle}><Text style={[s.body, { flex: 1 }]}>{label}</Text><Switch value={value} onValueChange={onChange} /></View>;
}
const styles = StyleSheet.create({
  label: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurface, marginTop: spacing.md },
  input: { marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: 16 },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, paddingVertical: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  quoteBox: { marginTop: spacing.xxl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surfaceSecondary },
  result: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  total: { fontFamily: fonts.text, fontSize: 30, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  breakdown: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
