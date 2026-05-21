import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}

/**
 * Click-to-toggle dropdown rendered via a portal so it escapes any
 * parent `overflow-hidden` or stacking-context clipping. Menu is
 * absolutely positioned in viewport coordinates based on the trigger's
 * bounding rect. Dismisses on outside click, Escape, or window resize.
 */
export function DropdownMenu({ trigger, children, align = "right" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const computeCoords = useCallback(() => {
    const tr = triggerRef.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!tr) return;
    const menuWidth = m?.width ?? 160;
    const top = tr.bottom + 4;
    const left = align === "right" ? tr.right - menuWidth : tr.left;
    setCoords({ top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) computeCoords();
  }, [open, computeCoords]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onResize() {
      computeCoords();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, computeCoords]);

  return (
    <>
      <button
        ref={triggerRef}
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
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-50 min-w-[160px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
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
