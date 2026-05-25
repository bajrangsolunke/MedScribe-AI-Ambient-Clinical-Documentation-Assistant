import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Stethoscope, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "sonner";

import { ConfirmModal } from "@/components/ConfirmModal";
import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avatarColor, patientInitials } from "@/lib/sessions";
import { ageFromDob } from "@/lib/patients";
import { cn } from "@/lib/utils";
import { ApiError, api } from "@/services/api";
import type { Patient } from "@/types";

const DEFAULT_PAGE_SIZE = 10;

export function PatientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Patient | null>(null);

  const patientsQuery = useQuery({
    queryKey: ["patients", "all"],
    queryFn: () => api.patients.list(),
  });

  const create = useMutation({
    mutationFn: () =>
      api.patients.create({
        full_label: newLabel.trim(),
        date_of_birth: newDob || null,
        notes: newNotes.trim() || null,
      }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setCreating(false);
      setNewLabel("");
      setNewDob("");
      setNewNotes("");
      toast.success("Patient created");
      navigate(`/patients/${p.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not create patient");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.patients.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setActionError(null);
      toast.success("Patient deleted");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Could not delete patient";
      // Backend returns 409 with a helpful "delete the visits first" message
      // — keep the inline banner too for emphasis, but also show a toast.
      setActionError(message);
      toast.error(message);
    },
  });

  const patients: Patient[] = useMemo(
    () => patientsQuery.data ?? [],
    [patientsQuery.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.full_label.toLowerCase().includes(q));
  }, [patients, query]);

  // Clamp the current page if the visible result set shrinks below it
  // (e.g. user searches and the filtered list is now shorter than where
  // they were paged to). Adapt-to-prop pattern — clamp during render
  // rather than in useEffect.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) {
    setPage(safePage);
  }

  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    create.mutate();
  }

  function handleEdit(p: Patient) {
    navigate(`/patients/${p.id}?edit=1`);
  }

  function handleDelete(p: Patient) {
    setPendingDelete(p);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    setActionError(null);
    remove.mutate(pendingDelete.id, {
      onSettled: () => setPendingDelete(null),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500">
            Your patient list. Click a patient to see their visit history or
            start a follow-up.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" />
          New patient
        </Button>
      </div>

      {creating && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="new-label">Patient name (non-PHI placeholder)</Label>
                  <Input
                    id="new-label"
                    autoFocus
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g., Patient #1 or John D."
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-dob">Date of birth (optional)</Label>
                  <Input
                    id="new-dob"
                    type="date"
                    value={newDob}
                    onChange={(e) => setNewDob(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-notes">Notes (optional)</Label>
                <textarea
                  id="new-notes"
                  rows={2}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g., allergic to penicillin"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!newLabel.trim() || create.isPending}>
                  {create.isPending ? "Creating…" : "Create patient"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients…"
              className="pl-8"
            />
          </div>

          {actionError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}

          {patientsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/40 p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <Stethoscope className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  No patients yet
                </h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Create your first patient to start grouping visits. Each new
                  recording can be linked so follow-ups stay together.
                </p>
              </div>
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                New patient
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No patients match your search.
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Patient</th>
                      <th className="w-16 px-3 py-2 font-medium">Age</th>
                      <th className="w-20 px-3 py-2 font-medium">Visits</th>
                      <th className="w-28 px-3 py-2 font-medium">Last visit</th>
                      <th className="px-3 py-2 font-medium">Notes</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map((p) => (
                      <PatientRow
                        key={p.id}
                        patient={p}
                        onOpen={() => navigate(`/patients/${p.id}`)}
                        onEdit={() => handleEdit(p)}
                        onDelete={() => handleDelete(p)}
                        isDeleting={remove.isPending && remove.variables === p.id}
                      />
                    ))}
                  </tbody>
                </table>
                <Pagination
                  total={filtered.length}
                  page={safePage}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmModal
        open={pendingDelete !== null}
        title={`Delete patient "${pendingDelete?.full_label ?? ""}"?`}
        description={
          pendingDelete && pendingDelete.visit_count > 0
            ? `This patient has ${pendingDelete.visit_count} visit${pendingDelete.visit_count === 1 ? "" : "s"}. The server will refuse the delete — remove the visits first.`
            : "This permanently removes the patient record. This cannot be undone."
        }
        confirmLabel="Delete patient"
        variant="danger"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

interface PatientRowProps {
  patient: Patient;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function PatientRow({ patient, onOpen, onEdit, onDelete, isDeleting }: PatientRowProps) {
  const age = ageFromDob(patient.date_of_birth);
  return (
    <tr
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "h-11 cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none",
        isDeleting && "opacity-50",
      )}
    >
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
              avatarColor(patient.full_label),
            )}
            aria-hidden
          >
            {patientInitials(patient.full_label)}
          </span>
          <span className="truncate font-medium text-slate-900">{patient.full_label}</span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-slate-600">{age !== null ? age : "—"}</td>
      <td className="px-3 py-1.5 text-slate-600">{patient.visit_count}</td>
      <td className="px-3 py-1.5 text-slate-600">
        {patient.last_visit_at ? (
          <span title={new Date(patient.last_visit_at).toLocaleString()}>
            {new Date(patient.last_visit_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="max-w-xs truncate px-3 py-1.5 text-slate-500">
        {patient.notes || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Edit patient"
            aria-label="Edit patient"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="Delete patient"
            aria-label="Delete patient"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
