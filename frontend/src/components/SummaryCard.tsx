interface Props {
  summary: string | null;
}

export function SummaryCard({ summary }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-sky-50/40 px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Visit Summary
      </div>
      <p className="mt-2 text-sm text-slate-700">
        {summary ?? <span className="italic text-slate-400">Summary will appear here when the pipeline completes.</span>}
      </p>
    </div>
  );
}
