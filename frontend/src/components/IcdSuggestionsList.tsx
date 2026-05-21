import { Check, ShieldCheck, ShieldQuestion, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { confidenceTone } from "@/lib/sessions";
import type { IcdSuggestion } from "@/types";

interface Props {
  icds: IcdSuggestion[];
  editable: boolean;
  onSetAccepted: (id: number, accepted: boolean) => Promise<void>;
}

export function IcdSuggestionsList({ icds, editable, onSetAccepted }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        ICD-10 Suggestions
      </div>
      <ul className="divide-y divide-slate-100">
        {icds.length === 0 && (
          <li className="px-4 py-6 text-center text-sm italic text-slate-400">
            No suggestions yet.
          </li>
        )}
        {icds.map((icd) => {
          const conf = confidenceTone(icd.confidence);
          const pct = Math.round(icd.confidence * 100);
          return (
            <li
              key={icd.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">{icd.code}</span>
                  {icd.is_validated ? (
                    <Badge variant="success" className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1">
                      <ShieldQuestion className="h-3 w-3" />
                      Unverified
                    </Badge>
                  )}
                  <ConfidenceMeter percent={pct} toneClass={conf.className} label={conf.label} />
                </div>
                <div className="mt-1 text-sm text-slate-700">{icd.description}</div>
                {icd.reasoning && (
                  <div className="mt-1 text-xs italic text-slate-500">{icd.reasoning}</div>
                )}
              </div>
              {editable && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={icd.accepted_by_user === true ? "primary" : "outline"}
                    onClick={() => onSetAccepted(icd.id, true)}
                    className={cn(icd.accepted_by_user === true && "bg-emerald-600 hover:bg-emerald-500")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant={icd.accepted_by_user === false ? "primary" : "outline"}
                    onClick={() => onSetAccepted(icd.id, false)}
                    className={cn(icd.accepted_by_user === false && "bg-slate-600 hover:bg-slate-500")}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConfidenceMeter({
  percent,
  toneClass,
  label,
}: {
  percent: number;
  toneClass: string;
  label: string;
}) {
  return (
    <span
      title={`AI confidence: ${percent}% (${label})`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass,
      )}
    >
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-white/60">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-current opacity-80"
          style={{ width: `${percent}%` }}
        />
      </span>
      AI {percent}%
    </span>
  );
}
