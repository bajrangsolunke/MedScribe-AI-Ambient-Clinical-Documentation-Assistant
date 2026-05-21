import { Check, ShieldCheck, ShieldQuestion, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { confidenceTone } from "@/lib/sessions";
import type { IcdSuggestion } from "@/types";

interface Props {
  icds: IcdSuggestion[];
  editable: boolean;
  onSetAccepted: (id: number, accepted: boolean) => Promise<void>;
  onUpdate?: (
    id: number,
    patch: { code?: string; description?: string },
  ) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export function IcdSuggestionsList({
  icds,
  editable,
  onSetAccepted,
  onUpdate,
  onDelete,
}: Props) {
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
          <IcdRow
            key={icd.id}
            icd={icd}
            editable={editable}
            onSetAccepted={onSetAccepted}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

interface IcdRowProps {
  icd: IcdSuggestion;
  editable: boolean;
  onSetAccepted: (id: number, accepted: boolean) => Promise<void>;
  onUpdate?: (
    id: number,
    patch: { code?: string; description?: string },
  ) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

function IcdRow({ icd, editable, onSetAccepted, onUpdate, onDelete }: IcdRowProps) {
  const conf = confidenceTone(icd.confidence);
  const pct = Math.round(icd.confidence * 100);

  // Track the persisted snapshot so we can resync on prop change without
  // a useEffect setState (React's recommended adapt-to-prop pattern).
  const [tracked, setTracked] = useState({
    code: icd.code,
    description: icd.description,
  });
  const [code, setCode] = useState(icd.code);
  const [description, setDescription] = useState(icd.description);
  const [savingField, setSavingField] = useState<"code" | "description" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (tracked.code !== icd.code || tracked.description !== icd.description) {
    setTracked({ code: icd.code, description: icd.description });
    setCode(icd.code);
    setDescription(icd.description);
  }

  async function commitCode() {
    if (!onUpdate) return;
    const next = code.trim().toUpperCase();
    if (!next || next === icd.code) {
      setCode(icd.code);
      return;
    }
    setSavingField("code");
    try {
      await onUpdate(icd.id, { code: next });
    } catch {
      setCode(icd.code); // revert on failure
    } finally {
      setSavingField(null);
    }
  }

  async function commitDescription() {
    if (!onUpdate) return;
    const next = description.trim();
    if (next === icd.description) return;
    setSavingField("description");
    try {
      await onUpdate(icd.id, { description: next });
    } catch {
      setDescription(icd.description);
    } finally {
      setSavingField(null);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      window.setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    await onDelete(icd.id);
  }

  const readonlyHeader = (
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
  );

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {editable && onUpdate ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={commitCode}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setCode(icd.code);
                  e.currentTarget.blur();
                }
              }}
              className="h-7 w-24 font-mono text-sm"
              title="Edit ICD code"
            />
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
            {savingField === "code" && (
              <span className="text-xs text-slate-400">saving…</span>
            )}
          </div>
        ) : (
          readonlyHeader
        )}

        {editable && onUpdate ? (
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={commitDescription}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDescription(icd.description);
                e.currentTarget.blur();
              }
            }}
            className="mt-1 h-8 text-sm"
            placeholder="Description"
          />
        ) : (
          <div className="mt-1 text-sm text-slate-700">{icd.description}</div>
        )}
        {savingField === "description" && (
          <span className="text-xs text-slate-400">saving…</span>
        )}
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
            className={cn(
              icd.accepted_by_user === true && "bg-emerald-600 hover:bg-emerald-500",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button
            size="sm"
            variant={icd.accepted_by_user === false ? "primary" : "outline"}
            onClick={() => onSetAccepted(icd.id, false)}
            className={cn(
              icd.accepted_by_user === false && "bg-slate-600 hover:bg-slate-500",
            )}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
          {onDelete && (
            <Button
              size="sm"
              variant={confirmingDelete ? "danger" : "ghost"}
              onClick={handleDelete}
              title={confirmingDelete ? "Click again to confirm" : "Remove suggestion"}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmingDelete && <span className="ml-1">Sure?</span>}
            </Button>
          )}
        </div>
      )}
    </li>
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
