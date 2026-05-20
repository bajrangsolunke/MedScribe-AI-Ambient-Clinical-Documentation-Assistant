import { Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
        {icds.map((icd) => (
          <li key={icd.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">{icd.code}</span>
                {icd.is_validated ? (
                  <Badge variant="success">✓ Verified</Badge>
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )}
                <Badge variant="neutral">conf {(icd.confidence * 100).toFixed(0)}%</Badge>
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
        ))}
      </ul>
    </div>
  );
}
