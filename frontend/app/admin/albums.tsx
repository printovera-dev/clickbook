import { useState } from "react";
import { Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Thumb } from "@/src/components/thumb";
import { AdminPage, DataTable, Badge, fmtDate } from "@/src/components/admin-page";
import { colors, fonts, radius, spacing } from "@/src/theme";

const STATUSES = ["draft", "ordered", "delivered"];

export default function AdminAlbums() {
  const [filter, setFilter] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin-albums", filter], queryFn: () => api.adminAlbums(filter || undefined) });
  return (
    <AdminPage title="Albums" testID="admin-albums" refreshing={q.isFetching} onRefresh={q.refetch}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Pressable onPress={() => setFilter(null)} style={[styles.chip, !filter && styles.chipActive]}><Text style={[styles.chipTxt, !filter && { color: colors.onBrandPrimary }]}>All</Text></Pressable>
        {STATUSES.map((st) => (
          <Pressable key={st} onPress={() => setFilter(st)} testID={`albums-filter-${st}`} style={[styles.chip, filter === st && styles.chipActive]}>
            <Text style={[styles.chipTxt, filter === st && { color: colors.onBrandPrimary }]}>{st}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <DataTable
        testID="admin-albums-table"
        rows={q.data?.albums || []}
        cols={[
          { key: "cover", label: "Cover", flex: 0.6, render: (a: any) => <Thumb uri={a.cover_thumbnail_url} recyclingKey={a.id} style={{ width: 44, height: 44, borderRadius: radius.sm }} /> },
          { key: "name", label: "Album", flex: 1.6, render: (a: any) => `${a.name || "Untitled"}\n${a.design_style || ""}` },
          { key: "customer", label: "Customer", flex: 1.4, render: (a: any) => `${a.customer_name || "—"}\n+91 ${a.customer_mobile || ""}` },
          { key: "photos", label: "Photos", flex: 0.6, render: (a: any) => String(a.photo_count ?? 0) },
          { key: "sheets", label: "Sheets", flex: 0.6, render: (a: any) => String(a.sheets ?? "—") },
          { key: "status", label: "Status", render: (a: any) => <Badge label={a.status || "draft"} tone={a.status === "delivered" ? "good" : a.status === "ordered" ? "info" : "neutral"} /> },
          { key: "locked", label: "Locked", flex: 0.6, render: (a: any) => (a.locked ? "Yes" : "No") },
          { key: "updated", label: "Updated", render: (a: any) => fmtDate(a.updated_at || a.created_at) },
        ]}
      />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontFamily: fonts.text, fontSize: 12, textTransform: "capitalize" },
});
