import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

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

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <BrandMark className="h-5 w-5 text-sky-300" />
            <span>MedScribe AI</span>
          </Link>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="opacity-80">{user.email}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-slate-800">
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </div>
          )}
        </div>
      </header>
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs text-amber-800">
        Demo mode — do not enter real patient information (PHI). Use synthetic test data only.
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
