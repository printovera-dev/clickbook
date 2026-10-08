import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { AdminPage, DataTable, Badge, Kpi, fmtDate, fmtMoney } from "@/src/components/admin-page";
import { s } from "@/src/ui";
import { spacing } from "@/src/theme";

export default function AdminPayments() {
  const q = useQuery({ queryKey: ["admin-payments"], queryFn: () => api.adminPayments() });
  const sum = q.data?.summary;
  return (
    <AdminPage title="Payments" testID="admin-payments" refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        <Kpi label="Collected" value={fmtMoney(sum?.collected)} hint={`${sum?.paid ?? 0} paid orders`} testID="pay-kpi-collected" />
        <Kpi label="Pending" value={fmtMoney(sum?.pending_amount)} hint={`${sum?.pending ?? 0} unpaid orders`} testID="pay-kpi-pending" />
      </View>
      <Text style={[s.label, { marginTop: spacing.xl }]}>All transactions</Text>
      <DataTable
        testID="admin-payments-table"
        rows={q.data?.payments || []}
        cols={[
          { key: "order", label: "Order ID", flex: 1.2, render: (o: any) => o.order_no },
          { key: "client", label: "Client", flex: 1.4, render: (o: any) => `${o.client_name || o.customer_snapshot?.name || "—"}\n+91 ${o.customer_snapshot?.mobile || ""}` },
          { key: "amount", label: "Amount", render: (o: any) => fmtMoney(o.price?.total) },
          { key: "sheets", label: "Sheets", flex: 0.6, render: (o: any) => String(o.sheets ?? "—") },
          { key: "method", label: "Method", render: (o: any) => o.payment_method || "—" },
          { key: "status", label: "Payment", render: (o: any) => <Badge label={o.payment_status === "paid" ? "Payment complete" : "Payment incomplete"} tone={o.payment_status === "paid" ? "good" : "warn"} /> },
          { key: "paid_at", label: "Date of payment", render: (o: any) => fmtDate(o.paid_at) },
          { key: "ref", label: "Payment ref", flex: 1.4, render: (o: any) => o.payment_id || "—" },
        ]}
      />
    </AdminPage>
  );
}
