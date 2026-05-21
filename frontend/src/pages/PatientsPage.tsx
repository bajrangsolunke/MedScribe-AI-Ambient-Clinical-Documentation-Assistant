import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Stethoscope, UserPlus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avatarColor, patientInitials, relativeTime } from "@/lib/sessions";
import { ageFromDob } from "@/lib/patients";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { Patient } from "@/types";

export function PatientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newNotes, setNewNotes] = useState("");

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
      navigate(`/patients/${p.id}`);
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    create.mutate();
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
        <CardContent className="space-y-4 p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients…"
              className="pl-8"
            />
          </div>

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  onOpen={() => navigate(`/patients/${p.id}`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PatientCard({
  patient,
  onOpen,
}: {
  patient: Patient;
  onOpen: () => void;
}) {
  const age = ageFromDob(patient.date_of_birth);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold",
            avatarColor(patient.full_label),
          )}
        >
          {patientInitials(patient.full_label)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {patient.full_label}
          </div>
          <div className="truncate text-xs text-slate-500">
            {age !== null && <>Age {age} · </>}
            {patient.visit_count} visit{patient.visit_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-500">
        {patient.last_visit_at
          ? `Last visit ${relativeTime(patient.last_visit_at)}`
          : "No visits yet"}
      </div>
      {patient.notes && (
        <Link
          to="#"
          onClick={(e) => e.preventDefault()}
          className="line-clamp-2 text-xs italic text-slate-400"
        >
          {patient.notes}
        </Link>
      )}
    </button>
  );
}
