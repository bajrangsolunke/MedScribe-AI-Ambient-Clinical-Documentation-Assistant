import { create } from "zustand";

import { api, setAuthToken } from "@/services/api";
import type { User } from "@/types";

const STORAGE_KEY = "medscribe-auth";

interface AuthState {
  token: string | null;
  user: User | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
}

function readStored(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStored(token: string, user: User) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

function clearStored() {
  localStorage.removeItem(STORAGE_KEY);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isHydrated: false,

  hydrate: async () => {
    const stored = readStored();
    if (!stored) {
      set({ isHydrated: true });
      return;
    }
    setAuthToken(stored.token);
    try {
      const fresh = await api.auth.me();
      set({ token: stored.token, user: fresh, isHydrated: true });
    } catch {
      clearStored();
      setAuthToken(null);
      set({ token: null, user: null, isHydrated: true });
    }
  },

  login: async (email, password) => {
    const resp = await api.auth.login(email, password);
    setAuthToken(resp.access_token);
    writeStored(resp.access_token, resp.user);
    set({ token: resp.access_token, user: resp.user });
  },

  register: async (email, password) => {
    const resp = await api.auth.register(email, password);
    setAuthToken(resp.access_token);
    writeStored(resp.access_token, resp.user);
    set({ token: resp.access_token, user: resp.user });
  },

  loginWithGoogle: async (idToken) => {
    const resp = await api.auth.google(idToken);
    setAuthToken(resp.access_token);
    writeStored(resp.access_token, resp.user);
    set({ token: resp.access_token, user: resp.user });
  },

  logout: () => {
    clearStored();
    setAuthToken(null);
    set({ token: null, user: null });
  },
}));
