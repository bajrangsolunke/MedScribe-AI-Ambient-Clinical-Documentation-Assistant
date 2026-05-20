import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StageState } from "@/hooks/useScribeSession";

interface Props {
  stages: StageState[];
}

export function PipelineStrip({ stages }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-sky-50 px-4 py-3">
      {stages.map((s) => (
        <span
          key={s.key}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            s.status === "done" && "bg-emerald-100 text-emerald-700",
            s.status === "in_progress" && "bg-sky-200 text-sky-800",
            s.status === "pending" && "bg-slate-200 text-slate-500",
            s.status === "error" && "bg-red-100 text-red-700",
          )}
        >
          {s.status === "done" ? (
            <Check className="h-3.5 w-3.5" />
          ) : s.status === "in_progress" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
          )}
          {s.label}
        </span>
      ))}
    </div>
  );
}
