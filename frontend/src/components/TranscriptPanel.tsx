interface Props {
  transcript: string | null;
}

export function TranscriptPanel({ transcript }: Props) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Transcript
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-6 text-slate-700">
        {transcript ? (
          <p className="whitespace-pre-wrap">{transcript}</p>
        ) : (
          <p className="italic text-slate-400">Transcript will appear here once recording is processed.</p>
        )}
      </div>
    </div>
  );
}
