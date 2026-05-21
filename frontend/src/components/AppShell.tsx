import { AlertTriangle, LogOut } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { avatarColor, patientInitials } from "@/lib/sessions";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
}

/** Same ECG waveform as the favicon — brand consistency. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="MedScribe AI"
    >
      <path
        d="M8 36 L18 36 L22 26 L30 46 L38 18 L42 36 L56 36"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({ children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-800 bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-base font-semibold tracking-tight"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-sky-300">
              <BrandMark className="h-5 w-5" />
            </span>
            <span>MedScribe AI</span>
          </Link>
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="group flex items-center gap-2 rounded-full p-1 pr-3 transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-400"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                    avatarColor(user.email),
                  )}
                >
                  {patientInitials(emailToName(user.email))}
                </span>
                <span className="hidden text-sm font-medium text-slate-100 sm:inline">
                  {emailToName(user.email)}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg"
                  >
                    <div className="border-b border-slate-100 px-4 py-3">
                      <div className="text-sm font-medium">{emailToName(user.email)}</div>
                      <div className="truncate text-xs text-slate-500">{user.email}</div>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs font-medium text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Demo environment — do not enter real patient information (PHI).</span>
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}

function emailToName(email: string): string {
  const local = email.split("@")[0] ?? email;
  // Replace separators with spaces and Title-Case each part.
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() + p.slice(1))
    .join(" ");
}
