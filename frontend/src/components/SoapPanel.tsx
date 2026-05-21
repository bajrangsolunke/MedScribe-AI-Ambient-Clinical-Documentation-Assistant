import { useState } from "react";

import { Label } from "@/components/ui/label";
import type { SoapPayload } from "@/types";

interface Props {
  soap: SoapPayload | null;
  editable: boolean;
  onSave: (updated: Omit<SoapPayload, "edited_at">) => Promise<void>;
}

const FIELDS: { key: keyof Omit<SoapPayload, "edited_at">; label: string }[] = [
  { key: "subjective", label: "Subjective (S)" },
  { key: "objective", label: "Objective (O)" },
  { key: "assessment", label: "Assessment (A)" },
  { key: "plan", label: "Plan (P)" },
];

function fromSoap(soap: SoapPayload | null): Omit<SoapPayload, "edited_at"> {
  return {
    subjective: soap?.subjective ?? "",
    objective: soap?.objective ?? "",
    assessment: soap?.assessment ?? "",
    plan: soap?.plan ?? "",
  };
}

export function SoapPanel({ soap, editable, onSave }: Props) {
  const [trackedSoap, setTrackedSoap] = useState(soap);
  const [local, setLocal] = useState(() => fromSoap(soap));
  const [savingField, setSavingField] = useState<string | null>(null);

  // Resync local state when the server-side SOAP changes. Setting state
  // during render (rather than in useEffect) is the React-recommended
  // pattern for adapting state to a changed prop.
  if (soap !== trackedSoap) {
    setTrackedSoap(soap);
    setLocal(fromSoap(soap));
  }

  async function handleBlur(field: string, current: string, original: string | undefined) {
    if (!editable) return;
    if (current === (original ?? "")) return;
    setSavingField(field);
    try {
      await onSave(local);
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        SOAP Note
        {soap?.edited_at && (
          <span className="ml-2 normal-case text-[10px] font-normal text-slate-400">
            edited {new Date(soap.edited_at).toLocaleString()}
          </span>
        )}
      </div>
      <div className="space-y-3 px-4 py-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`soap-${f.key}`} className="text-xs uppercase tracking-wide text-slate-500">
              {f.label} {savingField === f.key && <span className="ml-1 text-slate-400">saving…</span>}
            </Label>
            <textarea
              id={`soap-${f.key}`}
              className="mt-1 w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              rows={3}
              value={local[f.key]}
              disabled={!editable || !soap}
              placeholder={soap ? "" : "Waiting for generation…"}
              onChange={(e) => setLocal((s) => ({ ...s, [f.key]: e.target.value }))}
              onBlur={(e) => handleBlur(f.key, e.target.value, soap?.[f.key])}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
