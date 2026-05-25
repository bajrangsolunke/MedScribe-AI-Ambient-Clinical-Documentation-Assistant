import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Lightbulb,
  Mic,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { IcdSuggestionsList } from "@/components/IcdSuggestionsList";
import { PatientHeader } from "@/components/PatientHeader";
import { PatientPicker } from "@/components/PatientPicker";
import { PipelineStrip } from "@/components/PipelineStrip";
import { SoapPanel } from "@/components/SoapPanel";
import { SummaryCard } from "@/components/SummaryCard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { Waveform } from "@/components/Waveform";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecorder } from "@/hooks/useRecorder";
import { useStreamingSession } from "@/hooks/useStreamingSession";
import { cn } from "@/lib/utils";
import { avatarColor, patientInitials, relativeTime } from "@/lib/sessions";
import { ageFromDob } from "@/lib/patients";
import { api } from "@/services/api";
import type { Patient, SoapPayload } from "@/types";

async function downloadSessionPdf(id: number): Promise<void> {
  const blob = await api.sessions.exportPdf(id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `medscribe-session-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const presetPatientId = searchParams.get("patient_id");
  const presetLabel = searchParams.get("label");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [pickedPatient, setPickedPatient] = useState<Patient | null>(null);

  // If we arrived from PatientDetailPage with ?patient_id=…, pre-load
  // the patient so the picker shows them already selected.
  const presetQuery = useQuery({
    queryKey: ["patient", presetPatientId],
    queryFn: () => api.patients.get(Number(presetPatientId)),
    enabled: presetPatientId !== null,
  });

  // Adapt-to-prop pattern: sync the picker when the preset query resolves
  // (React's recommended approach — set state during render, not in useEffect).
  const [trackedPresetId, setTrackedPresetId] = useState<string | null>(presetPatientId);
  if (presetPatientId !== trackedPresetId) {
    setTrackedPresetId(presetPatientId);
    setPickedPatient(null);
  }
  if (presetQuery.data && pickedPatient?.id !== presetQuery.data.id) {
    setPickedPatient(presetQuery.data);
  }

  // Display fallback in case the patient hasn't loaded yet but we have a label
  const displayLabel = pickedPatient?.full_label ?? presetLabel ?? "";

  const recorder = useRecorder({ chunkMs: 4000 });
  const streaming = useStreamingSession(sessionId);

  // After the pipeline completes, fetch the full session detail (SOAP, ICDs, summary).
  const detailQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.sessions.get(sessionId!),
    enabled: sessionId !== null && streaming.phase === "completed",
    refetchOnMount: true,
  });

  const updateSoap = useMutation({
    mutationFn: (payload: Omit<SoapPayload, "edited_at">) =>
      api.sessions.updateSoap(sessionId!, payload),
    onSuccess: (data) => queryClient.setQueryData(["session", sessionId], data),
  });

  const setIcdAccepted = useMutation({
    mutationFn: ({ icdId, accepted }: { icdId: number; accepted: boolean }) =>
      api.sessions.setIcdAccepted(sessionId!, icdId, accepted),
    onSuccess: (data) => queryClient.setQueryData(["session", sessionId], data),
  });

  const updateIcd = useMutation({
    mutationFn: ({
      icdId,
      patch,
    }: {
      icdId: number;
      patch: { code?: string; description?: string };
    }) => api.sessions.updateIcd(sessionId!, icdId, patch),
    onSuccess: (data) => queryClient.setQueryData(["session", sessionId], data),
  });

  const deleteIcd = useMutation({
    mutationFn: (icdId: number) => api.sessions.deleteIcd(sessionId!, icdId),
    onSuccess: (data) => queryClient.setQueryData(["session", sessionId], data),
  });

  const updateSummary = useMutation({
    mutationFn: (summary: string) => api.sessions.updateSummary(sessionId!, summary),
    onSuccess: (data) => queryClient.setQueryData(["session", sessionId], data),
  });

  async function handleCreateSession(e: FormEvent) {
    e.preventDefault();
    if (!pickedPatient) return;
    const s = await api.sessions.create(
      pickedPatient.full_label,
      chiefComplaint.trim() || undefined,
      pickedPatient.id,
    );
    setSessionId(s.id);
  }

  async function handleCreatePatientInline(full_label: string): Promise<Patient> {
    const p = await api.patients.create({ full_label });
    queryClient.invalidateQueries({ queryKey: ["patients"] });
    return p;
  }

  function handleStartRecording() {
    void recorder.start((blob, isFinal) => streaming.pushChunk(blob, isFinal));
  }

  function handleStopRecording() {
    recorder.stop();
    // useStreamingSession.pushChunk handles the finalize call when isFinal=true.
  }

  if (sessionId === null) {
    const step = pickedPatient ? 2 : 1;
    return (
      <div className="space-y-5">
        {/* Header with back link + title + step indicator */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </button>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Start a new session
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pick the patient, add an optional chief complaint, then record.
            </p>
          </div>
          <Stepper step={step} />
        </div>

        <form onSubmit={handleCreateSession} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Left column: pick patient + chief complaint */}
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white dark:bg-slate-100 dark:text-slate-900">
                    1
                  </span>
                  Patient
                </div>
                <PatientPicker
                  selected={pickedPatient}
                  onSelect={(p) => setPickedPatient(p)}
                  onCreate={handleCreatePatientInline}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                      pickedPatient
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                        : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                    )}
                  >
                    2
                  </span>
                  Visit details
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cc">Chief complaint (optional)</Label>
                  <Input
                    id="cc"
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="e.g., chest pain, 2 days"
                    disabled={!pickedPatient}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    A one-line summary of why the patient is here today.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => navigate("/")}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={!pickedPatient} className="gap-2">
                <Mic className="h-4 w-4" />
                Start recording
              </Button>
            </div>
          </div>

          {/* Right column: contextual sidebar */}
          <aside className="lg:col-span-1">
            <ContextSidebar patient={pickedPatient} />
          </aside>
        </form>
      </div>
    );
  }

  const detail = detailQuery.data;
  const showPipelineStrip = streaming.phase !== "idle";
  const liveTranscriptActive = streaming.phase === "recording";
  const liveTranscriptDone = streaming.phase !== "idle" && streaming.phase !== "recording";
  // During recording, show the live-accumulating transcript. After finalize,
  // fall back to the persisted transcript (identical content, but stays around
  // even if the SSE stream closes).
  const transcriptToShow =
    streaming.phase === "completed" ? (detail?.transcript_text ?? streaming.transcript) : streaming.transcript;

  return (
    <div className="space-y-4">
      <PatientHeader
        patientLabel={displayLabel || `Patient #${sessionId}`}
        chiefComplaint={chiefComplaint || null}
        isRecording={recorder.isRecording}
        duration={recorder.duration}
        canRecord={streaming.phase === "idle" || streaming.phase === "recording"}
        onStart={handleStartRecording}
        onStop={handleStopRecording}
      />

      {recorder.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {recorder.error}
        </div>
      )}

      {recorder.isRecording && (
        <div className="rounded-lg border border-slate-200 bg-slate-900 px-4 py-3">
          <Waveform stream={recorder.stream} className="h-12 w-full" />
        </div>
      )}

      {showPipelineStrip && (
        <PipelineStrip
          stages={streaming.stages}
          liveTranscriptActive={liveTranscriptActive}
          liveTranscriptDone={liveTranscriptDone}
        />
      )}

      {streaming.phase === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-medium">Pipeline failed</div>
          <div className="mt-1">{streaming.error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TranscriptPanel
          transcript={transcriptToShow || null}
          live={streaming.phase === "recording"}
        />
        <div className="space-y-4">
          {streaming.phase === "recording" || streaming.phase === "idle" ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              SOAP note, ICD codes, and visit summary generate after you click Stop.
            </div>
          ) : (
            <>
              <SoapPanel
                soap={detail?.soap_note ?? null}
                editable={streaming.phase === "completed"}
                onSave={(payload) => updateSoap.mutateAsync(payload).then(() => undefined)}
              />
              <IcdSuggestionsList
                icds={detail?.icd_suggestions ?? []}
                editable={streaming.phase === "completed"}
                onSetAccepted={(icdId, accepted) =>
                  setIcdAccepted.mutateAsync({ icdId, accepted }).then(() => undefined)
                }
                onUpdate={(icdId, patch) =>
                  updateIcd.mutateAsync({ icdId, patch }).then(() => undefined)
                }
                onDelete={(icdId) => deleteIcd.mutateAsync(icdId).then(() => undefined)}
              />
              <SummaryCard
                summary={detail?.visit_summary ?? null}
                editable={streaming.phase === "completed"}
                onSave={(next) => updateSummary.mutateAsync(next).then(() => undefined)}
              />
            </>
          )}
        </div>
      </div>

      {streaming.phase === "completed" && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(`/sessions/${sessionId}`)}>
            Open in session view →
          </Button>
          <Button onClick={() => sessionId !== null && void downloadSessionPdf(sessionId)}>
            <Download className="h-4 w-4" />
            Save &amp; Download PDF
          </Button>
        </div>
      )}
    </div>
  );
}

// --- New-session screen helpers -------------------------------------------

function Stepper({ step }: { step: 1 | 2 }) {
  const items: { n: 1 | 2; label: string }[] = [
    { n: 1, label: "Patient" },
    { n: 2, label: "Visit" },
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map((it, i) => {
        const isActive = it.n === step;
        const isDone = it.n < step;
        return (
          <div key={it.n} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                isDone &&
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                isActive &&
                  "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                !isDone &&
                  !isActive &&
                  "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : it.n}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                isActive
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400",
              )}
            >
              {it.label}
            </span>
            {i < items.length - 1 && (
              <span className="h-px w-6 bg-slate-200 dark:bg-slate-700" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContextSidebar({ patient }: { patient: Patient | null }) {
  if (patient) {
    const age = ageFromDob(patient.date_of_birth);
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold",
                avatarColor(patient.full_label),
              )}
            >
              {patientInitials(patient.full_label)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                {patient.full_label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {age !== null && <>Age {age} · </>}
                {patient.visit_count > 0
                  ? `${patient.visit_count} prior visit${patient.visit_count === 1 ? "" : "s"}`
                  : "No prior visits"}
              </div>
            </div>
          </div>

          {patient.notes && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Notes
              </div>
              <p className="whitespace-pre-wrap">{patient.notes}</p>
            </div>
          )}

          {patient.last_visit_at && (
            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 text-sky-500" />
              <p>
                This will be visit{" "}
                <strong className="text-slate-700 dark:text-slate-200">
                  #{patient.visit_count + 1}
                </strong>
                . Last seen{" "}
                <strong className="text-slate-700 dark:text-slate-200">
                  {relativeTime(patient.last_visit_at)}
                </strong>
                .
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Tips for a good recording
        </div>
        <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-300 dark:text-slate-600">•</span>
            <span>Quiet room, mic ~30 cm from your mouth.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-300 dark:text-slate-600">•</span>
            <span>Speak naturally and pause briefly between sentences.</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-300 dark:text-slate-600">•</span>
            <span>
              The transcript appears <strong>every ~4 seconds</strong> while you talk.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 text-slate-300 dark:text-slate-600">•</span>
            <span>
              Click <strong>Stop</strong> when finished. SOAP + ICD + summary land in ~10s.
            </span>
          </li>
        </ul>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <strong>Demo only.</strong> Use a synthetic patient label and read from the
          scripted scenarios — no real PHI.
        </div>
      </CardContent>
    </Card>
  );
}
