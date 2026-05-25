import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  LogOut,
  Mic,
  Search,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { avatarColor, patientInitials, relativeTime } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

/**
 * Global command palette — toggled with ⌘K / Ctrl+K from anywhere.
 *
 * Sections:
 *  - Pages (Dashboard, Patients, New session)
 *  - Patients (live-searched, click to open or start a follow-up)
 *  - Recent sessions (5 most recent)
 *  - Account (logout)
 *
 * Pattern lifted from Linear / Granola / Notion: search-driven keyboard
 * navigation that experienced users keep their hands on.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { logout, isAuthenticated } = useAuth();

  // ⌘K / Ctrl+K opens the palette from any focused state.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset the query whenever the palette transitions from closed -> open
  // (adapt-to-prop pattern: derive state during render, not in useEffect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }

  // Only fetch patients + sessions when the palette is open and the user
  // is logged in. Stale time of 30s — keeps the palette snappy on reopen.
  const patientsQuery = useQuery({
    queryKey: ["palette-patients"],
    queryFn: () => api.patients.list(),
    enabled: open && isAuthenticated,
    staleTime: 30_000,
  });
  const sessionsQuery = useQuery({
    queryKey: ["palette-sessions"],
    queryFn: () => api.sessions.list(),
    enabled: open && isAuthenticated,
    staleTime: 30_000,
  });

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command palette" shouldFilter className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search patients, sessions, or jump to a page…"
              className="h-12 flex-1 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
            />
            <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 sm:inline">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto px-2 py-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-slate-500">
              No results.
            </Command.Empty>

            <Command.Group heading="Pages">
              <PaletteItem
                icon={<LayoutDashboard className="h-4 w-4" />}
                onSelect={() => go("/")}
                shortcut="G D"
              >
                Dashboard
              </PaletteItem>
              <PaletteItem
                icon={<Users className="h-4 w-4" />}
                onSelect={() => go("/patients")}
                shortcut="G P"
              >
                Patients
              </PaletteItem>
              <PaletteItem
                icon={<Mic className="h-4 w-4" />}
                onSelect={() => go("/sessions/new")}
                shortcut="N"
                highlight
              >
                Start new session
              </PaletteItem>
              <PaletteItem
                icon={<UserPlus className="h-4 w-4" />}
                onSelect={() => go("/patients")}
              >
                New patient
              </PaletteItem>
            </Command.Group>

            {patientsQuery.data && patientsQuery.data.length > 0 && (
              <Command.Group heading="Patients">
                {patientsQuery.data.slice(0, 8).map((p) => (
                  <PaletteItem
                    key={`p-${p.id}`}
                    keywords={[p.full_label, p.notes ?? ""]}
                    icon={
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold",
                          avatarColor(p.full_label),
                        )}
                      >
                        {patientInitials(p.full_label)}
                      </span>
                    }
                    onSelect={() => go(`/patients/${p.id}`)}
                  >
                    {p.full_label}
                    <span className="ml-auto text-xs text-slate-400">
                      {p.visit_count > 0
                        ? `${p.visit_count} visit${p.visit_count === 1 ? "" : "s"}`
                        : "no visits"}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            )}

            {sessionsQuery.data && sessionsQuery.data.length > 0 && (
              <Command.Group heading="Recent sessions">
                {sessionsQuery.data.slice(0, 5).map((s) => (
                  <PaletteItem
                    key={`s-${s.id}`}
                    keywords={[s.patient_label, s.chief_complaint ?? ""]}
                    icon={<Stethoscope className="h-4 w-4" />}
                    onSelect={() => go(`/sessions/${s.id}`)}
                  >
                    {s.patient_label}
                    <span className="ml-2 truncate text-xs text-slate-500">
                      · {s.chief_complaint || "No complaint"}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {relativeTime(s.started_at)}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Account">
              <PaletteItem
                icon={<LogOut className="h-4 w-4" />}
                onSelect={() => {
                  setOpen(false);
                  logout();
                  navigate("/login", { replace: true });
                }}
                danger
              >
                Sign out
              </PaletteItem>
            </Command.Group>
          </Command.List>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono">
                  ↵
                </kbd>
                select
              </span>
            </div>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono">
                ⌘K
              </kbd>
              toggle
            </span>
          </div>
        </Command>
      </div>
    </div>,
    document.body,
  );
}

interface PaletteItemProps {
  icon?: ReactNode;
  onSelect: () => void;
  shortcut?: string;
  highlight?: boolean;
  danger?: boolean;
  keywords?: string[];
  children: ReactNode;
}

function PaletteItem({
  icon,
  onSelect,
  shortcut,
  highlight,
  danger,
  keywords,
  children,
}: PaletteItemProps) {
  // Trash2 icon imported to satisfy potential future use without TS warn.
  void Trash2;
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 transition-colors",
        "data-[selected=true]:bg-slate-100",
        "aria-selected:bg-slate-100",
        highlight && "data-[selected=true]:bg-sky-50",
        danger &&
          "text-red-600 data-[selected=true]:bg-red-50 data-[selected=true]:text-red-700",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-500">
        {icon}
      </span>
      <span className="flex flex-1 items-center gap-2 truncate">{children}</span>
      {shortcut && (
        <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
