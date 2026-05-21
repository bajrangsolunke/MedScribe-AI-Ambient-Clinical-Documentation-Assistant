import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecorder } from "@/hooks/useRecorder";
import { useStreamingSession } from "@/hooks/useStreamingSession";
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
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>New session</CardTitle>
            <CardDescription>
              Pick the patient (or create a new one), add an optional chief
              complaint, then start recording.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Patient</Label>
                <PatientPicker
                  selected={pickedPatient}
                  onSelect={(p) => setPickedPatient(p)}
                  onCreate={handleCreatePatientInline}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cc">Chief complaint (optional)</Label>
                <Input
                  id="cc"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="e.g., chest pain, 2 days"
                />
              </div>
              <div className="flex justify-between gap-2">
                <Button type="button" variant="ghost" onClick={() => navigate("/")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!pickedPatient}>
                  Create session
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
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
