import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  total: number;
  page: number; // 1-indexed
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

/**
 * Compact, consistent pagination bar used by both the Sessions and
 * Patients tables. Renders "Showing X–Y of Z" on the left, page-size
 * selector + prev/next + a small window of page numbers on the right.
 *
 * Page numbers use a sliding window of up to 5 pages, with ellipses
 * on either side when the total page count exceeds the window.
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  const visible = pageWindow(current, totalPages, 5);

  return (
    <div className="flex flex-col items-start gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-slate-500">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            Showing <span className="font-medium text-slate-700">{start}</span>–
            <span className="font-medium text-slate-700">{end}</span> of{" "}
            <span className="font-medium text-slate-700">{total}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:border-slate-400 focus:outline-none"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <PaginationButton
            disabled={current === 1}
            onClick={() => onPageChange(current - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </PaginationButton>

          {visible.map((item, idx) =>
            item === "ellipsis" ? (
              <span key={`e-${idx}`} className="px-2 text-xs text-slate-400">
                …
              </span>
            ) : (
              <PaginationButton
                key={item}
                active={item === current}
                onClick={() => onPageChange(item)}
                aria-label={`Page ${item}`}
              >
                {item}
              </PaginationButton>
            ),
          )}

          <PaginationButton
            disabled={current === totalPages}
            onClick={() => onPageChange(current + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </PaginationButton>
        </div>
      </div>
    </div>
  );
}

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

function PaginationButton({ active, className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 min-w-[28px] items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function pageWindow(
  current: number,
  total: number,
  windowSize: number,
): (number | "ellipsis")[] {
  if (total <= windowSize + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, current - half);
  let end = start + windowSize - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - windowSize + 1);
  }
  const out: (number | "ellipsis")[] = [];
  if (start > 1) {
    out.push(1);
    if (start > 2) out.push("ellipsis");
  }
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total) {
    if (end < total - 1) out.push("ellipsis");
    out.push(total);
  }
  return out;
}
