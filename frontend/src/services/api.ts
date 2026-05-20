import type {
  IcdSuggestion,
  SessionDetail,
  SessionSummary,
  SoapPayload,
  TokenResponse,
  User,
} from "@/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

let cachedToken: string | null = null;

export function setAuthToken(token: string | null) {
  cachedToken = token;
}

export function getApiUrl(): string {
  return API_URL;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (cachedToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${cachedToken}`);
  }
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const resp = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204 || resp.headers.get("content-length") === "0") {
    return undefined as T;
  }
  const contentType = resp.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await resp.json()) as T;
  }
  return (await resp.blob()) as T;
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<TokenResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      request<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<User>("/auth/me"),
  },
  sessions: {
    create: (patient_label: string, chief_complaint?: string) =>
      request<SessionSummary>("/sessions", {
        method: "POST",
        body: JSON.stringify({ patient_label, chief_complaint: chief_complaint ?? null }),
      }),
    list: () => request<SessionSummary[]>("/sessions"),
    get: (id: number) => request<SessionDetail>(`/sessions/${id}`),
    uploadAudio: (id: number, audio: Blob, filename: string) => {
      const fd = new FormData();
      fd.append("file", audio, filename);
      return request<{ status: string; filename: string }>(`/sessions/${id}/audio`, {
        method: "POST",
        body: fd,
      });
    },
    retry: (id: number, audio: Blob, filename: string) => {
      const fd = new FormData();
      fd.append("file", audio, filename);
      return request<{ status: string; filename: string }>(`/sessions/${id}/retry`, {
        method: "POST",
        body: fd,
      });
    },
    updateSoap: (id: number, soap: Omit<SoapPayload, "edited_at">) =>
      request<SessionDetail>(`/sessions/${id}/soap`, {
        method: "PATCH",
        body: JSON.stringify(soap),
      }),
    setIcdAccepted: (sessionId: number, icdId: number, accepted: boolean) =>
      request<SessionDetail>(`/sessions/${sessionId}/icd/${icdId}`, {
        method: "PATCH",
        body: JSON.stringify({ accepted }),
      }),
    exportPdf: async (id: number): Promise<Blob> => {
      const resp = await fetch(`${API_URL}/sessions/${id}/export.pdf`, {
        headers: cachedToken ? { Authorization: `Bearer ${cachedToken}` } : undefined,
      });
      if (!resp.ok) throw new ApiError(resp.status, await resp.text());
      return await resp.blob();
    },
    streamUrl: (id: number, token: string) =>
      `${API_URL}/sessions/${id}/stream?access_token=${encodeURIComponent(token)}`,
  },
};

export type Api = typeof api;
export type { IcdSuggestion };
