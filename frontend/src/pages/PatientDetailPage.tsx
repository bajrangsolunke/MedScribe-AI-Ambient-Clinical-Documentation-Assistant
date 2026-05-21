import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mic, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avatarColor, patientInitials, relativeTime } from "@/lib/sessions";
import { ageFromDob } from "@/lib/patients";
import { cn } from "@/lib/utils";
import { ApiError, api } from "@/services/api";
import type { SessionStatus } from "@/types";

function statusBadgeVariant(
  status: SessionStatus,
): "success" | "warning" | "info" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "recording") return "warning";
  if (status === "processing") return "info";
  if (status === "failed") return "danger";
  return "neutral";
}

export function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ? Number(params.id) : NaN;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState("");
  const [dob, setDob] = useState("");
  const [notes, setNotes] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["patient", id],
    queryFn: () => api.patients.get(id),
    enabled: !Number.isNaN(id),
  });

  // Auto-enter edit mode if the URL has ?edit=1 (e.g. from the
  // PatientsPage Edit button). Adapt-to-prop pattern: trigger once
  // when data lands, then strip the param so a refresh doesn't redo it.
  const [editTriggered, setEditTriggered] = useState(false);
  if (data && searchParams.get("edit") === "1" && !editTriggered) {
    setEditTriggered(true);
    setLabel(data.full_label);
    setDob(data.date_of_birth ?? "");
    setNotes(data.notes ?? "");
    setEditing(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }

  const update = useMutation({
    mutationFn: () =>
      api.patients.update(id, {
        full_label: label.trim() || undefined,
        date_of_birth: dob || null,
        notes: notes || null,
      }),
    onSuccess: (p) => {
      queryClient.setQueryData(["patient", id], { ...data!, ...p });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setEditing(false);
    },
  });

  const removePatient = useMutation({
    mutationFn: () => api.patients.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      navigate("/patients");
    },
    onError: (err) => {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete patient",
      );
    },
  });

  function handleStartEdit() {
    if (!data) return;
    setLabel(data.full_label);
    setDob(data.date_of_birth ?? "");
    setNotes(data.notes ?? "");
    setEditing(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate();
  }

  function handleDelete() {
    if (!data) return;
    const msg = `Delete patient "${data.full_label}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setDeleteError(null);
    removePatient.mutate();
  }

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">Patient not found.</p>
        <Link to="/patients" className="text-sm text-slate-600 hover:underline">
          ← Back to patients
        </Link>
      </div>
    );
  }

  const age = ageFromDob(data.date_of_birth);

  return (
    <div className="space-y-4">
      <Link
        to="/patients"
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        All patients
      </Link>

      <Card>
        <CardContent className="p-5">
          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="label">Patient name</Label>
                  <Input
                    id="label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dob">Date of birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <span
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full text-base font-semibold",
                  avatarColor(data.full_label),
                )}
              >
                {patientInitials(data.full_label)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-semibold text-slate-900">
                  {data.full_label}
                </div>
                <div className="text-sm text-slate-500">
                  {age !== null && <>Age {age} · </>}
                  {data.visit_count} visit{data.visit_count === 1 ? "" : "s"}
                  {data.last_visit_at && (
                    <> · last visit {relativeTime(data.last_visit_at)}</>
                  )}
                </div>
                {data.notes && (
                  <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm text-slate-600">
                    {data.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() =>
                    navigate(
                      `/sessions/new?patient_id=${data.id}&label=${encodeURIComponent(
                        data.full_label,
                      )}`,
                    )
                  }
                >
                  <Mic className="h-4 w-4" />
                  New visit
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleStartEdit}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
          {deleteError && (
            <p className="mt-3 text-sm text-red-600">{deleteError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Visit history
          </div>
          {data.sessions.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No visits recorded yet. Click <span className="font-medium">New visit</span>{" "}
              above to start one.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.sessions.map((s) => (
                <li
                  key={s.id}
                  onClick={() => navigate(`/sessions/${s.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/sessions/${s.id}`);
                    }
                  }}
                  className="flex cursor-pointer items-center justify-between gap-3 px-2 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className="font-medium text-slate-900"
                        title={new Date(s.started_at).toLocaleString()}
                      >
                        {new Date(s.started_at).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-slate-400">
                        {relativeTime(s.started_at)}
                      </span>
                      <Badge variant={statusBadgeVariant(s.status)}>{s.status}</Badge>
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {s.chief_complaint || "No chief complaint"}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">Open →</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
