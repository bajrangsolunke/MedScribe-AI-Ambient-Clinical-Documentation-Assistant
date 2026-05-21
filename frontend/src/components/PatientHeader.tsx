import { Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  patientLabel: string;
  chiefComplaint: string | null;
  isRecording: boolean;
  duration: number;
  canRecord: boolean;
  onStart: () => void;
  onStop: () => void;
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function PatientHeader({
  patientLabel,
  chiefComplaint,
  isRecording,
  duration,
  canRecord,
  onStart,
  onStop,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div>
        <div className="text-lg font-semibold text-slate-900">{patientLabel}</div>
        {chiefComplaint && (
          <div className="text-sm text-slate-500">Chief complaint: {chiefComplaint}</div>
        )}
      </div>
      {canRecord && (
        isRecording ? (
          <Button variant="danger" onClick={onStop} className="gap-2">
            <Square className="h-4 w-4 fill-current" />
            <span>Recording {formatDuration(duration)} — click to stop</span>
          </Button>
        ) : (
          <Button onClick={onStart} className="gap-2">
            <Mic className="h-4 w-4" />
            Start recording
          </Button>
        )
      )}
    </div>
  );
}
