import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "medscribe-theme";

export type Theme = "light" | "dark";

function getStored(): Theme {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark") return v;
  // Default to light. We deliberately do NOT auto-follow the OS pref —
  // healthcare reviewers visit on whatever device they have, the default
  // should be predictable.
  return "light";
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

// Ensure the stored theme is applied on first load, before React mounts,
// so there's no light-to-dark flash. Safe to call multiple times.
if (typeof window !== "undefined") {
  applyTheme(getStored());
}

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const theme = useSyncExternalStore(
    subscribe,
    () => getStored(),
    () => "light" as Theme,
  );
  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    notify();
  }, []);
  const toggle = useCallback(() => {
    setTheme(getStored() === "dark" ? "light" : "dark");
  }, [setTheme]);
  return { theme, setTheme, toggle };
}
