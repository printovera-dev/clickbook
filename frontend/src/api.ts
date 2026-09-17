// API client for ClickBook backend
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const TOKEN_KEY = "clickbook.customerToken";
export const ADMIN_TOKEN_KEY = "clickbook.adminToken";

let _memToken: string | null = null;
let _memAdminToken: string | null = null;

export async function setToken(token: string | null) {
  _memToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  if (_memToken) return _memToken;
  const t = await AsyncStorage.getItem(TOKEN_KEY);
  _memToken = t;
  return t;
}

export async function setAdminToken(token: string | null) {
  _memAdminToken = token;
  if (token) await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
  else await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function getAdminToken(): Promise<string | null> {
  if (_memAdminToken) return _memAdminToken;
  const t = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
  _memAdminToken = t;
  return t;
}

export function fileUrl(pathOrUrl?: string | null): string | undefined {
  if (!pathOrUrl) return undefined;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${BASE}${pathOrUrl}`;
  return `${BASE}/api/files/${pathOrUrl}`;
}

async function request<T = any>(
  path: string,
  opts: { method?: string; body?: any; admin?: boolean; auth?: boolean; raw?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.admin) {
    const t = await getAdminToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  } else if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    let detail: any = null;
    try {
      detail = JSON.parse(text).detail;
      msg = typeof detail === "string" ? detail : detail?.message || text;
    } catch {}
    const err: any = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

async function uploadFile(path: string, uri: string, filename: string, webFile: any, admin: boolean) {
  {
    const token = admin ? await getAdminToken() : await getToken();
    const form = new FormData();
    if (Platform.OS === "web") {
      // Web: FormData needs a real File/Blob, not the RN {uri} shim
      let file: any = webFile;
      if (!file) {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        file = new File([blob], filename, { type: blob.type || "image/jpeg" });
      }
      form.append("file", file);
    } else {
      // Native (Expo SDK 54+): fetch is WinterCG-compliant and rejects the legacy {uri,name,type} shim.
      const { File: ExpoFile } = await import("expo-file-system");
      form.append("file", new ExpoFile(uri) as any, filename);
    }
    const res = await fetch(`${BASE}/api${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form as any,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(await res.text()).detail || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }
}

export const api = {
  // update api signature
  sendOtp: (mobile: string, channel = "whatsapp") =>
    request<{ success: boolean; provider?: string; dev_hint?: string }>("/auth/otp/send", { method: "POST", body: { mobile, channel } }),
  verifyOtp: (mobile: string, otp: string) =>
    request<{ token: string; customer: any }>("/auth/otp/verify", { method: "POST", body: { mobile, otp } }),
  me: () => request<{ customer: any }>("/me"),
  updateMe: (data: any) => request<{ customer: any }>("/me", { method: "PUT", body: data }),

  // Catalog
  listCovers: () => request<{ covers: any[] }>("/covers"),
  listLayouts: () => request<{ layouts: any[] }>("/layouts"),
  listBackgrounds: () => request<{ backgrounds: any[] }>("/backgrounds"),
  listOffers: () => request<{ offers: any[] }>("/offers"),
  getSettings: () => request<{ settings: any }>("/settings"),

  // Albums
  createAlbum: (cover_id: string, name?: string) =>
    request<{ album: any }>("/albums", { method: "POST", body: { cover_id, name } }),
  listMyAlbums: () => request<{ albums: any[] }>("/albums"),
  getAlbum: (id: string) => request<{ album: any }>(`/albums/${id}`),
  autoGenerate: (id: string, style?: string, cover_photo_id?: string) =>
    request<{ album: any }>(`/albums/${id}/generate`, { method: "POST", body: { style: style || null, cover_photo_id: cover_photo_id || null } }),
  updateAlbum: (id: string, data: any) => request<{ album: any }>(`/albums/${id}`, { method: "PUT", body: data }),
  updatePages: (id: string, pages: any[]) =>
    request<{ album: any }>(`/albums/${id}/pages`, { method: "PUT", body: { pages } }),
  deletePhoto: (albumId: string, photoId: string) =>
    request(`/albums/${albumId}/photos/${photoId}`, { method: "DELETE" }),

  // Upload
  uploadPhoto: (albumId: string, uri: string, filename: string, webFile?: any) =>
    uploadFile(`/albums/${albumId}/photos`, uri, filename, webFile, false),
  adminUploadImage: (uri: string, filename: string, webFile?: any) =>
    uploadFile(`/admin/images`, uri, filename, webFile, true),

  // Pricing / Orders
  calculatePrice: (sheets: number, coupon_code?: string, gift_wrap = false) =>
    request<any>("/pricing/calculate", { method: "POST", body: { sheets, coupon_code: coupon_code || null, gift_wrap } }),
  createOrder: (data: any) => request<any>("/orders", { method: "POST", body: data }),
  payOrder: (order_id: string) =>
    request<any>("/orders/pay", { method: "POST", body: { order_id, payment_method: "mock" } }),
  paymentsConfig: () => request<{ provider: string; razorpay_key_id: string }>("/payments/config"),
  createRazorpayOrder: (order_id: string) =>
    request<any>("/payments/razorpay/order", { method: "POST", body: { order_id } }),
  verifyRazorpay: (data: any) => request<any>("/payments/razorpay/verify", { method: "POST", body: data }),
  listMyOrders: () => request<{ orders: any[] }>("/orders"),
  getOrder: (id: string) => request<{ order: any; process_bots: any[] }>(`/orders/${id}`),

  // Notifications (customer)
  listNotifications: () => request<{ notifications: any[]; unread_count: number }>("/notifications"),
  readNotification: (id: string) => request(`/notifications/${id}/read`, { method: "POST", body: {} }),
  readAllNotifications: () => request("/notifications/read-all", { method: "POST", body: {} }),

  // Policies
  listPolicies: () => request<{ policies: any[] }>("/policies"),
  getPolicy: (key: string) => request<{ policy: any }>(`/policies/${key}`),

  // Admin
  adminLogin: (username: string, password: string) =>
    request<{ token: string; admin: any }>("/admin/login", { method: "POST", body: { username, password } }),
  adminDashboard: () => request<any>("/admin/dashboard", { admin: true }),
  adminOrders: (status?: string) =>
    request<{ orders: any[] }>(`/admin/orders${status ? `?status=${status}` : ""}`, { admin: true }),
  adminUpdateOrderStatus: (id: string, data: any) =>
    request(`/admin/orders/${id}/status`, { method: "PUT", body: data, admin: true }),
  adminGeneratePdf: (id: string) => request<any>(`/admin/orders/${id}/pdf`, { method: "POST", body: {}, admin: true }),
  adminOrderDownloads: (id: string) => request<{ package: any; files: any[] }>(`/admin/orders/${id}/downloads`, { admin: true }),
  adminDownloadsZipUrl: async (id: string) => `${BASE}/api/admin/orders/${id}/downloads.zip?token=${encodeURIComponent((await getAdminToken()) || "")}`,
  adminSendNotification: (data: { title: string; body: string; type: string; customer_id?: string | null; order_id?: string | null }) =>
    request<{ sent: number; broadcast: boolean }>("/admin/notifications", { method: "POST", body: data, admin: true }),
  adminNotifications: () => request<{ notifications: any[] }>("/admin/notifications", { admin: true }),
  adminListCovers: () => request<{ covers: any[] }>("/covers?admin=true", { admin: true }),
  adminCreateCover: (data: any) => request("/admin/covers", { method: "POST", body: data, admin: true }),
  adminUpdateCover: (id: string, data: any) => request(`/admin/covers/${id}`, { method: "PUT", body: data, admin: true }),
  adminDeleteCover: (id: string) => request(`/admin/covers/${id}`, { method: "DELETE", admin: true }),
  adminOffers: () => request<{ offers: any[] }>("/admin/offers", { admin: true }),
  adminCreateOffer: (data: any) => request("/admin/offers", { method: "POST", body: data, admin: true }),
  adminUpdateOffer: (id: string, data: any) => request(`/admin/offers/${id}`, { method: "PUT", body: data, admin: true }),
  adminUpdateSettings: (data: any) => request("/admin/settings", { method: "PUT", body: data, admin: true }),
  adminProcessBots: () => request<{ process_bots: any[] }>("/admin/process-bots", { admin: true }),
  adminUpdateBot: (id: string, data: any) => request(`/admin/process-bots/${id}`, { method: "PUT", body: data, admin: true }),
  adminCustomers: () => request<{ customers: any[] }>("/admin/customers", { admin: true }),
};
