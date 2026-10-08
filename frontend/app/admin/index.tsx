import { Redirect } from "expo-router";

// /admin → dashboard (the admin layout guard redirects guests to /admin/login).
export default function AdminIndex() {
  return <Redirect href="/admin/dashboard" />;
}
