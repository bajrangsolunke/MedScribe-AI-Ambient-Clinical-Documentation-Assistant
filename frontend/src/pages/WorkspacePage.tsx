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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecorder } from "@/hooks/useRecorder";
import { useScribeSession } from "@/hooks/useScribeSession";
import { api } from "@/services/api";
import type { SoapPayload } from "@/types";

export function WorkspacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [patientLabel, setPatientLabel] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const recorder = useRecorder();
  const pipeline = useScribeSession(sessionId);

  const detailQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.sessions.get(sessionId!),
    enabled: sessionId !== null && pipeline.phase === "completed",
    refetchOnMount: true,
  });

  const updateSoap = useMutation({
    mutationFn: (payload: Omit<SoapPayload, "edited_at">) =>
      api.sessions.updateSoap(sessionId!, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["session", sessionId], data);
    },
  });

  const setIcdAccepted = useMutation({
    mutationFn: ({ icdId, accepted }: { icdId: number; accepted: boolean }) =>
      api.sessions.setIcdAccepted(sessionId!, icdId, accepted),
    onSuccess: (data) => {
      queryClient.setQueryData(["session", sessionId], data);
    },
  });

  async function handleCreateSession(e: FormEvent) {
    e.preventDefault();
    const s = await api.sessions.create(patientLabel.trim(), chiefComplaint.trim() || undefined);
    setSessionId(s.id);
  }

  async function handleStop() {
    recorder.stop();
    // Wait for the blob to be assembled (onstop populates audioBlob asynchronously).
    // useEffect-driven kickoff:
  }

  // Kick off the pipeline as soon as the recorder produces a blob.
  if (
    sessionId !== null &&
    recorder.audioBlob !== null &&
    pipeline.phase === "idle"
  ) {
    void pipeline.start(recorder.audioBlob, `session-${sessionId}.webm`);
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
  const isUploading = pipeline.phase === "uploading";
  const isStreaming = pipeline.phase === "streaming";

  return (
    <div className="space-y-4">
      <PatientHeader
        patientLabel={patientLabel || `Patient #${sessionId}`}
        chiefComplaint={chiefComplaint || null}
        isRecording={recorder.isRecording}
        duration={recorder.duration}
        canRecord={pipeline.phase === "idle" && recorder.audioBlob === null}
        onStart={() => void recorder.start()}
        onStop={handleStop}
      />

      {recorder.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {recorder.error}
        </div>
      )}

      {(isUploading || isStreaming || pipeline.phase === "completed" || pipeline.phase === "failed") && (
        <PipelineStrip stages={pipeline.stages} />
      )}

      {pipeline.phase === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-medium">Pipeline failed</div>
          <div className="mt-1">{pipeline.error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TranscriptPanel transcript={detail?.transcript_text ?? null} />
        <div className="space-y-4">
          <SoapPanel
            soap={detail?.soap_note ?? null}
            editable={pipeline.phase === "completed"}
            onSave={(payload) => updateSoap.mutateAsync(payload).then(() => undefined)}
          />
          <IcdSuggestionsList
            icds={detail?.icd_suggestions ?? []}
            editable={pipeline.phase === "completed"}
            onSetAccepted={(icdId, accepted) =>
              setIcdAccepted.mutateAsync({ icdId, accepted }).then(() => undefined)
            }
          />
          <SummaryCard summary={detail?.visit_summary ?? null} />
        </div>
      </div>

      {pipeline.phase === "completed" && (
        <div className="flex justify-end">
          <Button onClick={() => navigate(`/sessions/${sessionId}`)}>View / download PDF →</Button>
        </div>
      )}
    </div>
  );
}
