import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}

/**
 * Minimal click-to-toggle dropdown with click-outside dismissal.
 * Avoids pulling in @radix-ui just for one menu.
 */
export function DropdownMenu({ trigger, children, align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          className={cn(
            "absolute top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onSelect: () => void;
  children: ReactNode;
  variant?: "default" | "danger";
  icon?: ReactNode;
  disabled?: boolean;
}

export function DropdownItem({
  onSelect,
  children,
  variant = "default",
  icon,
  disabled,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        variant === "danger"
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-700 hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center">{icon}</span>}
      <span className="flex-1">{children}</span>
    </button>
  );
}
