import { AdminHomeCms } from "@/src/components/admin-home-cms";

export default function AdminHome() {
  return <AdminHomeCms title="Home Page CMS" tabs={["slider1", "slider2", "slider3", "heroes", "videos", "accordions", "promo", "brand"]} />;
}
