import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Lightweight confirmation modal — portal'd to <body> so it escapes any
 * stacking context, click-outside to dismiss, Escape to cancel, Enter
 * to confirm. Used to replace window.confirm everywhere.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          {variant === "danger" && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
          )}
          <div className="flex-1">
            <h2
              id="confirm-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {title}
            </h2>
            {description && (
              <div className="mt-1 text-sm text-slate-600">{description}</div>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef as React.Ref<HTMLButtonElement>}
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
            className={cn(loading && "cursor-wait")}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
