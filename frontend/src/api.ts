// API client for ClickBook backend
import AsyncStorage from "@react-native-async-storage/async-storage";

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
    try {
      msg = JSON.parse(text).detail || text;
    } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  sendOtp: (mobile: string, channel = "whatsapp") =>
    request("/auth/otp/send", { method: "POST", body: { mobile, channel } }),
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
  autoGenerate: (id: string) => request<{ album: any }>(`/albums/${id}/generate`, { method: "POST", body: {} }),
  updatePages: (id: string, pages: any[]) =>
    request<{ album: any }>(`/albums/${id}/pages`, { method: "PUT", body: { pages } }),
  deletePhoto: (albumId: string, photoId: string) =>
    request(`/albums/${albumId}/photos/${photoId}`, { method: "DELETE" }),

  // Upload
  uploadPhoto: async (albumId: string, uri: string, filename: string) => {
    const token = await getToken();
    const form = new FormData();
    // @ts-ignore React Native FormData
    form.append("file", { uri, name: filename, type: "image/jpeg" });
    const res = await fetch(`${BASE}/api/albums/${albumId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form as any,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  // Pricing / Orders
  calculatePrice: (sheets: number, coupon_code?: string, gift_wrap = false) =>
    request<any>("/pricing/calculate", { method: "POST", body: { sheets, coupon_code: coupon_code || null, gift_wrap } }),
  createOrder: (data: any) => request<any>("/orders", { method: "POST", body: data }),
  payOrder: (order_id: string) =>
    request<any>("/orders/pay", { method: "POST", body: { order_id, payment_method: "mock" } }),
  listMyOrders: () => request<{ orders: any[] }>("/orders"),
  getOrder: (id: string) => request<{ order: any; process_bots: any[] }>(`/orders/${id}`),

  // Admin
  adminLogin: (username: string, password: string) =>
    request<{ token: string; admin: any }>("/admin/login", { method: "POST", body: { username, password } }),
  adminDashboard: () => request<any>("/admin/dashboard", { admin: true }),
  adminOrders: (status?: string) =>
    request<{ orders: any[] }>(`/admin/orders${status ? `?status=${status}` : ""}`, { admin: true }),
  adminUpdateOrderStatus: (id: string, data: any) =>
    request(`/admin/orders/${id}/status`, { method: "PUT", body: data, admin: true }),
  adminGeneratePdf: (id: string) => request<any>(`/admin/orders/${id}/pdf`, { method: "POST", body: {}, admin: true }),
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
