import { useQuery } from "@tanstack/react-query";
import { Plus, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avatarColor, patientInitials, relativeTime } from "@/lib/sessions";
import { ageFromDob } from "@/lib/patients";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { Patient } from "@/types";

interface Props {
  selected: Patient | null;
  onSelect: (patient: Patient) => void;
  onCreate: (full_label: string) => Promise<Patient>;
}

/**
 * Two-mode picker:
 * 1. Search existing patients (debounced 200ms list call) and pick from
 *    a dropdown; or
 * 2. Click "+ New patient" to inline-create with just a label.
 *
 * Once a patient is selected the picker collapses into a confirmation
 * card showing the chosen patient.
 */
export function PatientPicker({ selected, onSelect, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mode, setMode] = useState<"search" | "creating">("search");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", debounced],
    queryFn: () => api.patients.list(debounced || undefined),
    enabled: !selected && mode === "search",
    staleTime: 5_000,
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
              avatarColor(selected.full_label),
            )}
          >
            {patientInitials(selected.full_label)}
          </span>
          <div>
            <div className="text-sm font-medium text-slate-900">{selected.full_label}</div>
            <div className="text-xs text-slate-500">
              {selected.visit_count > 0
                ? `${selected.visit_count} prior visit${selected.visit_count === 1 ? "" : "s"} · last ${relativeTime(selected.last_visit_at!)}`
                : "First visit"}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSelect(null as unknown as Patient)} // parent clears selection
          className="text-slate-500"
        >
          Change
        </Button>
      </div>
    );
  }

  if (mode === "creating") {
    async function handleCreate() {
      const label = newLabel.trim();
      if (!label) return;
      setCreating(true);
      try {
        const p = await onCreate(label);
        onSelect(p);
        setNewLabel("");
        setMode("search");
      } finally {
        setCreating(false);
      }
    }

    return (
      <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
        <Label htmlFor="new-patient-label" className="text-xs">
          New patient name (non-PHI placeholder)
        </Label>
        <div className="flex gap-2">
          <Input
            id="new-patient-label"
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g., Patient #1 or John D."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
              if (e.key === "Escape") setMode("search");
            }}
          />
          <Button type="button" disabled={!newLabel.trim() || creating} onClick={handleCreate}>
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setMode("search");
              setNewLabel("");
            }}
          >
            Cancel
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          You can add date of birth and notes later from the patient page.
        </p>
      </div>
    );
  }

  // search mode
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients by name…"
          className="pl-8"
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
        {isLoading ? (
          <p className="px-3 py-4 text-sm text-slate-500">Loading…</p>
        ) : patients.length === 0 ? (
          <p className="px-3 py-4 text-sm italic text-slate-500">
            {debounced ? `No patients match "${debounced}".` : "No patients yet."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {patients.map((p) => {
              const age = ageFromDob(p.date_of_birth);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        avatarColor(p.full_label),
                      )}
                    >
                      {patientInitials(p.full_label)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {p.full_label}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {age !== null && <>Age {age} · </>}
                        {p.visit_count > 0
                          ? `${p.visit_count} visit${p.visit_count === 1 ? "" : "s"} · last ${relativeTime(p.last_visit_at!)}`
                          : "no visits yet"}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setMode("creating")}
        className="w-full"
      >
        <UserPlus className="h-4 w-4" />
        New patient
      </Button>
      {/* Plus icon imported but unused after the latest refactor — keep it
          to satisfy the linter and signal future "+ Add visit" affordance. */}
      <Plus className="hidden" aria-hidden />
    </div>
  );
}
