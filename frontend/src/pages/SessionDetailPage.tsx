import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { IcdSuggestionsList } from "@/components/IcdSuggestionsList";
import { PatientHeader } from "@/components/PatientHeader";
import { SoapPanel } from "@/components/SoapPanel";
import { SummaryCard } from "@/components/SummaryCard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { SoapPayload } from "@/types";

export function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = params.id ? Number(params.id) : NaN;

  const { data, isLoading, error } = useQuery({
    queryKey: ["session", id],
    queryFn: () => api.sessions.get(id),
    enabled: !Number.isNaN(id),
  });

  const updateSoap = useMutation({
    mutationFn: (payload: Omit<SoapPayload, "edited_at">) =>
      api.sessions.updateSoap(id, payload),
    onSuccess: (d) => queryClient.setQueryData(["session", id], d),
  });

  const setIcdAccepted = useMutation({
    mutationFn: ({ icdId, accepted }: { icdId: number; accepted: boolean }) =>
      api.sessions.setIcdAccepted(id, icdId, accepted),
    onSuccess: (d) => queryClient.setQueryData(["session", id], d),
  });

  const updateIcd = useMutation({
    mutationFn: ({
      icdId,
      patch,
    }: {
      icdId: number;
      patch: { code?: string; description?: string };
    }) => api.sessions.updateIcd(id, icdId, patch),
    onSuccess: (d) => queryClient.setQueryData(["session", id], d),
  });

  const deleteIcd = useMutation({
    mutationFn: (icdId: number) => api.sessions.deleteIcd(id, icdId),
    onSuccess: (d) => queryClient.setQueryData(["session", id], d),
  });

  const updateSummary = useMutation({
    mutationFn: (summary: string) => api.sessions.updateSummary(id, summary),
    onSuccess: (d) => queryClient.setQueryData(["session", id], d),
  });

  async function handleDownload() {
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

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error || !data)
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Session not found.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Back to dashboard
        </Button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          All sessions
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant={data.status === "completed" ? "success" : data.status === "failed" ? "danger" : "info"}>
            {data.status}
          </Badge>
          {data.status === "completed" && (
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          )}
        </div>
      </div>

      <PatientHeader
        patientLabel={data.patient_label}
        chiefComplaint={data.chief_complaint}
        isRecording={false}
        duration={0}
        canRecord={false}
        onStart={() => undefined}
        onStop={() => undefined}
      />

      {data.status === "failed" && data.error_message && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-medium">Pipeline failed</div>
          <div className="mt-1">{data.error_message}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TranscriptPanel transcript={data.transcript_text} />
        <div className="space-y-4">
          <SoapPanel
            soap={data.soap_note}
            editable={data.status === "completed"}
            onSave={(payload) => updateSoap.mutateAsync(payload).then(() => undefined)}
          />
          <IcdSuggestionsList
            icds={data.icd_suggestions}
            editable={data.status === "completed"}
            onSetAccepted={(icdId, accepted) =>
              setIcdAccepted.mutateAsync({ icdId, accepted }).then(() => undefined)
            }
            onUpdate={(icdId, patch) =>
              updateIcd.mutateAsync({ icdId, patch }).then(() => undefined)
            }
            onDelete={(icdId) => deleteIcd.mutateAsync(icdId).then(() => undefined)}
          />
          <SummaryCard
            summary={data.visit_summary}
            editable={data.status === "completed"}
            onSave={(next) => updateSummary.mutateAsync(next).then(() => undefined)}
          />
        </div>
      </div>
    </div>
  );
}
