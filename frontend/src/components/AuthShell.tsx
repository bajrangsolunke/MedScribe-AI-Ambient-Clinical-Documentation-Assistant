import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Same ECG waveform as the favicon + header brand mark. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
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

/**
 * Shared chrome for the Login + Register pages.
 *
 * Aurora gradient backdrop + glass-style card. The glow blobs are
 * pure CSS gradients with blur — no images, no extra deps. The card
 * itself sits above with a subtle backdrop-blur for a soft glass feel.
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-slate-50 p-6">
      {/* Aurora backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[640px] -translate-x-1/2 rounded-full bg-sky-300/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-1/4 h-[420px] w-[560px] rounded-full bg-violet-300/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 left-1/4 h-[320px] w-[440px] rounded-full bg-emerald-200/30 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand mark + title above the card */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-sky-300 shadow-lg ring-1 ring-slate-900/10">
            <BrandMark className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-slate-900/[0.06] backdrop-blur-xl sm:p-8">
          {children}
        </div>

        {footer && <div className="mt-4 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}
