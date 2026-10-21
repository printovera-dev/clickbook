import React, { useState } from "react";
import { Platform, ScrollView, Text, View, StyleSheet } from "react-native";
import { AdminPage } from "@/src/components/admin-page";
import { Button, s } from "@/src/ui";
import { BASE, getAdminToken } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function PrintingPricingAdmin() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<any>(null);

  async function upload() {
    if (Platform.OS !== "web") {
      setNotice("Excel upload is available in the web admin panel.");
      return;
    }
    if (!picked) { setNotice("Choose an .xlsx, .xlsm, or .csv pricing file first."); return; }
    setBusy(true); setNotice("");
    try {
      const token = await getAdminToken();
      const body = new FormData();
      body.append("file", picked);
      const response = await fetch(`${BASE}/api/pricing/printing/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Import failed");
      setNotice(`Imported ${data.imported_rows} pricing rows. Existing printing rules have been replaced by this validated sheet.`);
    } catch (e: any) {
      setNotice(e.message || "Could not import the pricing file.");
    } finally { setBusy(false); }
  }

  return (
    <AdminPage title="Printing Pricing & Excel Import" testID="admin-printing-pricing">
      <Text style={s.bodyMuted}>Upload your printing rate card to configure quantity-based prices for all print products. Import validates the spreadsheet before replacing the current rule list.</Text>
      <View style={styles.panel}>
        <Text style={s.h2}>1. Prepare the Excel sheet</Text>
        <Text style={s.bodyMuted}>Use the first worksheet. One row per product/size/GSM/print-type/finish/sides and quantity band. Quantity bands can have different per-piece rates.</Text>
        <Text style={styles.code}>category | size | paper_gsm | print_type | lamination | sides | min_quantity | max_quantity | unit_cost | setup_cost | wastage_percent | profit_margin_percent | gst_percent</Text>
        <Text style={s.bodyMuted}>Example values: Visiting Cards, 3.5x2 in, 300, Digital, Gloss, Double-sided, 100, 249, 3.50, 150, 5, 30, 18</Text>
        <Text style={s.bodyMuted}>Use “Single-sided” or “Double-sided”. For an open-ended quantity band, leave max_quantity blank.</Text>
      </View>
      <View style={styles.panel}>
        <Text style={s.h2}>2. Upload pricing workbook</Text>
        {Platform.OS === "web" ? React.createElement("input" as any, {
          type: "file",
          accept: ".xlsx,.xlsm,.csv",
          onChange: (event: any) => { setPicked(event?.target?.files?.[0] || null); setNotice(""); },
          style: { marginTop: 12, marginBottom: 12, maxWidth: "100%" },
        }) : <Text style={s.bodyMuted}>Open this admin page in a web browser to upload an Excel file.</Text>}
        {picked ? <Text style={s.bodyMuted}>Selected: {picked.name}</Text> : null}
        <View style={{ marginTop: spacing.md }}><Button label={busy ? "Importing…" : "Validate & import Excel"} onPress={upload} disabled={busy || !picked} /></View>
        {notice ? <Text style={[s.body, { marginTop: spacing.md, color: notice.startsWith("Imported") ? colors.success : colors.danger }]}>{notice}</Text> : null}
      </View>
      <Text style={s.bodyMuted}>Important: importing replaces the active printing pricing rules, not orders or customer data. Export/back up your existing rate card before importing a replacement.</Text>
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, gap: spacing.sm },
  code: { marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, fontSize: 12, lineHeight: 19 },
});
