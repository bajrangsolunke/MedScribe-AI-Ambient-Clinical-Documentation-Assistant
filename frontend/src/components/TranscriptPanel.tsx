import { useEffect, useRef } from "react";

interface Props {
  transcript: string | null;
  live?: boolean;
}

export function TranscriptPanel({ transcript, live }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (live && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [transcript, live]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Transcript
        </span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            LIVE
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-6 text-slate-700"
      >
        {transcript ? (
          <p className="whitespace-pre-wrap">{transcript}</p>
        ) : (
          <p className="italic text-slate-400">
            Transcript will appear here as you speak.
          </p>
        )}
      </div>
    </div>
  );
}
