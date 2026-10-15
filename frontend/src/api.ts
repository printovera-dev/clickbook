// API client for ClickBook backend
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

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
  if (/^(https?:|file:|blob:|data:|content:)/i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/api/")) return `${BASE}${pathOrUrl}`;
  return `${BASE}/api/files/${pathOrUrl}`;
}

async function request<T = any>(
  path: string,
  opts: { method?: string; body?: any; admin?: boolean; auth?: boolean; raw?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.admin) {
    const t = await getAdminToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  } else if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const controller = opts.timeoutMs ? new AbortController() : undefined;
  const timeout = opts.timeoutMs && controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs)
    : undefined;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (cause: any) {
    if (cause?.name === "AbortError") {
      const err: any = new Error(`Request timed out after ${Math.round((opts.timeoutMs || 0) / 1000)} seconds`);
      err.retryable = true;
      throw err;
    }
    throw cause;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

  // Catalog (paginated: {items, total, next_offset}; admin can add unlimited assets)
  listCovers: (offset = 0, limit = 20) => request<{ covers: any[]; total: number; next_offset: number | null }>(`/covers?offset=${offset}&limit=${limit}`),
  listLayouts: () => request<{ layouts: any[]; total: number }>("/layouts?limit=100"),
  listBackgrounds: (offset = 0, limit = 100) => request<{ backgrounds: any[]; total: number; next_offset: number | null }>(`/backgrounds?offset=${offset}&limit=${limit}`),
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
  reorderPhotos: (albumId: string, photoIds: string[]) =>
    request<{ photos: any[] }>(`/albums/${albumId}/photos/order`, { method: "PUT", body: { photo_ids: photoIds } }),

  // Upload photos directly to S3 when configured, avoiding routing every large image
  // through the API server. Local-storage deployments retain the existing multipart path.
  // Direct-to-S3 is the primary path for speed. If the browser cannot complete
  // the cross-origin S3 transfer, keep uploads working through the existing API path.
  uploadPhoto: async (albumId: string, uri: string, filename: string, webFile?: any) => {
    const fallback = () => uploadFile(`/albums/${albumId}/photos`, uri, filename, webFile, false);
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    let presign: { direct_upload: boolean; upload_url?: string; key?: string };
    try {
      presign = await request<{ direct_upload: boolean; upload_url?: string; key?: string }>(
        `/albums/${albumId}/photos/presign`,
        { method: "POST", body: { filename }, timeoutMs: 30000 },
      );
    } catch (e: any) {
      const status = Number(e?.status || 0);
      if (!status || status >= 500 || status === 408 || status === 429) {
        console.warn("S3 presign unavailable; using backend upload fallback.", e);
        return fallback();
      }
      throw e;
    }

    if (!presign.direct_upload || !presign.upload_url || !presign.key) return fallback();

    let fileBody: any;
    let contentType = "application/octet-stream";
    if (Platform.OS === "web") {
      let file: any = webFile;
      if (!file) {
        const resp = await fetch(uri);
        if (!resp.ok) throw new Error("Could not read selected photo");
        const blob = await resp.blob();
        file = new File([blob], filename, { type: blob.type || "image/jpeg" });
      }
      if (typeof file.size === "number" && file.size > 20 * 1024 * 1024) {
        throw new Error("File too large (max 20MB)");
      }
      fileBody = file;
      contentType = file.type || "image/jpeg";
    } else {
      const { File: ExpoFile } = await import("expo-file-system");
      fileBody = new ExpoFile(uri);
      const size = Number((fileBody as any).size || 0);
      if (size > 20 * 1024 * 1024) throw new Error("File too large (max 20MB)");
      contentType = (fileBody as any).type || "image/jpeg";
    }

    // Retry the same signed object URL; a lost response after a successful PUT is safe
    // because PUT to the same key simply overwrites that object.
    let put: Response | null = null;
    let putError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      try {
        put = await fetch(presign.upload_url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: fileBody,
          signal: controller.signal,
        } as any);
        if (put.ok) break;
        const retryable = [408, 429, 500, 502, 503, 504].includes(put.status);
        if (!retryable) {
          console.warn(`Direct S3 upload returned HTTP ${put.status}; using backend fallback.`);
          return fallback();
        }
        putError = new Error(`S3 upload returned HTTP ${put.status}`);
      } catch (e: any) {
        putError = e;
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < 2) await delay(700 * (attempt + 1));
    }
    if (!put?.ok) {
      console.warn("Direct S3 upload did not complete after retries; using backend fallback.", putError);
      return fallback();
    }

    // Completion is idempotent by S3 key on the backend. Retry transient failures so
    // a temporary connection drop cannot leave an uploaded object missing from the album.
    let completionError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await request<{ photo: any }>(`/albums/${albumId}/photos/complete`, {
          method: "POST",
          body: { filename, key: presign.key },
          timeoutMs: 110000,
        });
      } catch (e: any) {
        completionError = e;
        const status = Number(e?.status || 0);
        const retryable = !status || status >= 500 || status === 408 || status === 429;
        if (!retryable || attempt === 2) throw e;
        await delay(900 * (attempt + 1));
      }
    }
    throw completionError || new Error("Could not register uploaded photo");
  },
  adminUploadImage: (uri: string, filename: string, webFile?: any) =>
    uploadFile(`/admin/images`, uri, filename, webFile, true),
  adminUploadVideo: (uri: string, filename: string, webFile?: any) =>
    uploadFile(`/admin/videos`, uri, filename, webFile, true),
  adminOrdersExportUrl: (range: "daily" | "weekly" | "monthly" | "all", token: string) =>
    `${BASE}/api/admin/orders/export.xlsx?range=${range}&token=${encodeURIComponent(token)}`,

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

  // Home page CMS
  homeContent: () => request<{ content: any; pricing: any; promo: any | null }>("/home", { auth: false }),
  adminHome: () => request<{ content: any }>("/admin/home", { admin: true }),
  adminUpdateHome: (data: any) => request<{ content: any }>("/admin/home", { method: "PUT", body: data, admin: true }),

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
  adminMe: () => request<{ admin: any }>("/admin/me", { admin: true }),
  adminChangePassword: (current_password: string, new_password: string) =>
    request("/admin/password", { method: "PUT", body: { current_password, new_password }, admin: true }),
  adminDashboard: () => request<any>("/admin/dashboard", { admin: true }),
  adminPayments: () => request<{ payments: any[]; summary: any }>("/admin/payments", { admin: true }),
  adminAlbums: (status?: string) => request<{ albums: any[] }>(`/admin/albums${status ? `?status=${status}` : ""}`, { admin: true }),
  adminLayouts: () => request<{ layouts: any[] }>("/admin/layouts", { admin: true }),
  adminCreateLayout: (data: any) => request("/admin/layouts", { method: "POST", body: data, admin: true }),
  adminUpdateLayout: (id: string, data: any) => request(`/admin/layouts/${id}`, { method: "PUT", body: data, admin: true }),
  adminDeleteLayout: (id: string) => request(`/admin/layouts/${id}`, { method: "DELETE", admin: true }),
  adminBackgrounds: () => request<{ backgrounds: any[] }>("/admin/backgrounds", { admin: true }),
  adminCreateBackground: (data: any) => request("/admin/backgrounds", { method: "POST", body: data, admin: true }),
  adminUpdateBackground: (id: string, data: any) => request(`/admin/backgrounds/${id}`, { method: "PUT", body: data, admin: true }),
  adminDeleteBackground: (id: string) => request(`/admin/backgrounds/${id}`, { method: "DELETE", admin: true }),
  adminOrders: (status?: string) =>
    request<{ orders: any[] }>(`/admin/orders${status ? `?status=${status}` : ""}`, { admin: true }),
  adminUpdateOrderStatus: (id: string, data: any) =>
    request(`/admin/orders/${id}/status`, { method: "PUT", body: data, admin: true }),
  adminDeleteOrder: (id: string) => request(`/admin/orders/${id}`, { method: "DELETE", admin: true }),
  adminGeneratePdf: (id: string) => request<any>(`/admin/orders/${id}/pdf`, { method: "POST", body: {}, admin: true }),
  adminOrderDownloads: (id: string) => request<{ package: any; files: any[] }>(`/admin/orders/${id}/downloads`, { admin: true }),
  adminDownloadsZipUrl: async (id: string) => `${BASE}/api/admin/orders/${id}/downloads.zip?token=${encodeURIComponent((await getAdminToken()) || "")}`,
  adminSendNotification: (data: { title: string; body: string; type: string; customer_id?: string | null; order_id?: string | null }) =>
    request<{ sent: number; broadcast: boolean }>("/admin/notifications", { method: "POST", body: data, admin: true }),
  adminNotifications: () => request<{ notifications: any[] }>("/admin/notifications", { admin: true }),
  adminListCovers: () => request<{ covers: any[] }>("/covers?admin=true&limit=100", { admin: true }),
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
