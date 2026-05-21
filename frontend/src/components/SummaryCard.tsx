import { useState } from "react";

interface Props {
  summary: string | null;
  editable?: boolean;
  onSave?: (next: string) => Promise<void>;
}

export function SummaryCard({ summary, editable, onSave }: Props) {
  const [tracked, setTracked] = useState(summary);
  const [local, setLocal] = useState(summary ?? "");
  const [saving, setSaving] = useState(false);

  // Sync local edits when the server-side summary changes (e.g. pipeline
  // completes after recording). Adapt-to-prop pattern — set state during
  // render rather than in useEffect.
  if (summary !== tracked) {
    setTracked(summary);
    setLocal(summary ?? "");
  }

  async function commit() {
    if (!onSave) return;
    const next = local.trim();
    if (next === (summary ?? "")) return;
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      setLocal(summary ?? ""); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-sky-50/40 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Visit Summary</span>
        {saving && <span className="font-normal normal-case text-slate-400">saving…</span>}
      </div>
      {editable && onSave ? (
        <textarea
          className="mt-2 w-full resize-y rounded border border-slate-200 bg-white/70 px-2 py-1.5 text-sm leading-relaxed text-slate-800 focus:border-slate-400 focus:outline-none"
          rows={3}
          value={local}
          placeholder={summary ? "" : "Summary will appear here when the pipeline completes."}
          disabled={!summary && !editable}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <p className="mt-2 text-sm text-slate-700">
          {summary ?? (
            <span className="italic text-slate-400">
              Summary will appear here when the pipeline completes.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
