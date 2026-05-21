import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { IcdSuggestionsList } from "@/components/IcdSuggestionsList";
import { PatientHeader } from "@/components/PatientHeader";
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
import type { SoapPayload } from "@/types";

export function WorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [patientLabel, setPatientLabel] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);

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
    const s = await api.sessions.create(patientLabel.trim(), chiefComplaint.trim() || undefined);
    setSessionId(s.id);
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
            <CardDescription>Enter a non-PHI label, then start recording.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="label">Patient label</Label>
                <Input
                  id="label"
                  value={patientLabel}
                  onChange={(e) => setPatientLabel(e.target.value)}
                  placeholder="e.g., Patient #1"
                  required
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
                <Button type="submit" disabled={!patientLabel.trim()}>
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
        patientLabel={patientLabel || `Patient #${sessionId}`}
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
        <div className="flex justify-end">
          <Button onClick={() => navigate(`/sessions/${sessionId}`)}>View / download PDF →</Button>
        </div>
      )}
    </div>
  );
}
