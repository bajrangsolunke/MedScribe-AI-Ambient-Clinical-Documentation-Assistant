# MedScribe AI — Sub-project #3 Implementation Plan

> **Lightweight plan**: phases + checklists, not per-step TDD. See spec at [`docs/superpowers/specs/2026-05-21-medscribe-patients-design.md`](../specs/2026-05-21-medscribe-patients-design.md). Build phases in order; commit after each checked group.

**Goal**: Add a `Patient` entity. Sessions become visits of a patient. Doctor picks an existing patient (or creates a new one) when starting a session.

**Branch**: Continue on `feat/sub-project-1-core-scribe` (single-branch project per user preference).

---

## Phase 1 — Backend: data model + migration

**Goal**: `patients` table exists, `sessions.patient_id` FK works, existing sessions remain functional.

- [ ] Create `backend/app/models/patient.py` — `Patient` model: id PK, `user_id` FK indexed, `full_label` String(120), `date_of_birth` Date nullable, `notes` Text nullable, `created_at`/`updated_at` DateTime. Relationship `sessions: list[ConsultSession]` ordered by `started_at desc`.
- [ ] Export `Patient` from `backend/app/models/__init__.py`.
- [ ] Edit `backend/app/models/consult_session.py` — add `patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), nullable=True, index=True)` plus reciprocal `patient: Mapped["Patient | None"] = relationship(back_populates="sessions")`.
- [ ] Edit `backend/app/models/user.py` — add `patients` relationship cascade=all,delete-orphan.
- [ ] `cd backend && .venv/bin/alembic revision --autogenerate -m "add patients + sessions.patient_id"` — verify the generated file adds the table + column + FK + index; no batch enum gymnastics needed this time.
- [ ] `.venv/bin/alembic upgrade head` — apply against the dev DB. Confirm existing sessions still load via `.venv/bin/python -c "from app.database import SessionLocal; from app.models import ConsultSession; print([s.patient_id for s in SessionLocal().query(ConsultSession).all()])"` — should all be None.
- [ ] Run `.venv/bin/pytest -q` — existing 42 tests stay green (no behavior change yet).
- [ ] Commit: `feat(backend): Phase 1 — Patient model + sessions.patient_id (Sub-project #3)`.

**Done when**: migration applies cleanly, existing tests green, no behavior visible to the user yet.

---

## Phase 2 — Backend: API endpoints + tests

**Goal**: `/patients` CRUD works; `POST /sessions` accepts `patient_id`; session payloads include the FK; tests cover happy + failure paths.

- [ ] Create `backend/app/schemas/patient.py` — `PatientCreate`, `PatientUpdate`, `PatientOut` (with derived `last_visit_at` + `visit_count`), `PatientDetail` (extends Out with `sessions: list[SessionOut]`).
- [ ] Create `backend/app/api/patients.py` — router with the 5 endpoints from the spec. Use `selectinload(Patient.sessions)` on the detail endpoint to avoid N+1. Compute derived fields with a small helper (similar to `_serialize_session`).
- [ ] Wire `patients` router into `backend/app/main.py`.
- [ ] Edit `backend/app/schemas/session.py` — add `patient_id: int | None = None` to `SessionCreate`. Add `patient_id: int | None = None` to `SessionOut` (so list + detail responses include it).
- [ ] Edit `backend/app/api/sessions.py`:
  - `create_session`: if `payload.patient_id` is set, verify it belongs to the user (404 otherwise) and assign.
  - `_serialize_session` / `_serialize_session_detail`: include `patient_id`.
- [ ] Create `backend/tests/test_patients_api.py` covering:
  - register → create patient (201) → list shows it (visit_count=0)
  - GET cross-user → 404
  - PATCH updates label + sets updated_at
  - DELETE with no sessions → 204
  - DELETE with sessions → 409
  - search ?q=John filters
  - last_visit_at + visit_count populated after sessions linked
- [ ] Edit `backend/tests/test_sessions_api.py`:
  - new test: create session with patient_id links correctly; payload echoes patient_id
  - new test: create session with another user's patient_id → 404
- [ ] Run `.venv/bin/pytest -q` — target ~50 tests passing. Run `.venv/bin/ruff check app tests` — clean.
- [ ] Commit: `feat(backend): Phase 2 — /patients API + session linking (Sub-project #3)`.

**Done when**: full backend suite green; all new patient endpoints exercised; sessions can be linked.

---

## Phase 3 — Frontend: API + Patients page + create flow

**Goal**: User can manage patients in the UI and link new sessions to them.

- [ ] Edit `frontend/src/types.ts` — add `Patient`, `PatientDetail` interfaces with the fields from the spec. Add `patient_id: number | null` to `SessionSummary` + `SessionDetail`.
- [ ] Edit `frontend/src/services/api.ts` — add `api.patients = { list, create, get, update, delete }`. Modify `api.sessions.create` signature to `(patient_label, chief_complaint?, patient_id?)`.
- [ ] Create `frontend/src/pages/PatientsPage.tsx` — header with search input + "+ New patient" button (opens modal/dialog), card grid of patients with name, age (derived from DOB), visit count, last visit relative time, notes excerpt. Empty state with stethoscope icon + CTA.
- [ ] Create `frontend/src/pages/PatientDetailPage.tsx` — back link, patient header card with Edit/Delete actions, "+ New visit" primary button (navigates to `/sessions/new?patient_id={id}`), visit timeline (reuses dashboard SessionRow logic).
- [ ] Create `frontend/src/components/PatientPicker.tsx` — combobox: debounced search of `api.patients.list?q=`, dropdown of matches with name + meta, "+ Create new patient" inline action that opens a tiny form (just `full_label`).
- [ ] Edit `frontend/src/pages/WorkspacePage.tsx` — replace the bare patient_label input with `<PatientPicker>` for step-1 (or display selected patient when arriving with `?patient_id=` query param). On session create, pass `patient_id` if a real patient was picked.
- [ ] Edit `frontend/src/components/AppShell.tsx` — add "Patients" link next to brand wordmark; active state when route starts with `/patients`.
- [ ] Edit `frontend/src/routes.tsx` — add `/patients` → `PatientsPage` and `/patients/:id` → `PatientDetailPage`, both wrapped in `ProtectedRoute` + `AppShell`.
- [ ] Edit `frontend/src/pages/DashboardPage.tsx` SessionRow — add a small patient chip (`👤 {patient_label}` or `Walk-in` when null) linking to `/patients/{id}` when set.
- [ ] Run `npx tsc -b --noEmit` clean; `npx eslint .` clean; `npx vite build` clean.
- [ ] Manual smoke test: register → create patient → create session linked to that patient → open Patients page → click patient → see the visit listed → click visit → see session detail.
- [ ] Commit: `feat(frontend): Phase 3 — Patients page + picker + session linking (Sub-project #3)`.

**Done when**: end-to-end patient flow works; same patient can have multiple visits; dashboard shows patient chips.

---

## Phase 4 — Polish + docs

- [ ] Patient detail: show "Last chief complaint: X" hint at the top, helps doctor recall context before starting a new visit.
- [ ] Session header during recording: when linked to a patient, show "Patient: John D. · 3rd visit · last seen 5d ago".
- [ ] Edit dashboard empty state: if no patients exist either, prompt "Create your first patient" instead of "New session".
- [ ] Edit `README.md` — bump roadmap (mark Sub-project #3 done, demote clinical intelligence to #4). Add `patients` table to the architecture diagram.
- [ ] Edit `docs/demo/recording-script.md` — note that the new flow starts with "Pick or create patient".
- [ ] Commit: `feat: Phase 4 — patient context polish + docs (Sub-project #3)`.

**Done when**: docs reflect the new flow; manual smoke test passes a full follow-up scenario.

---

## Order of execution

Strict phase order: 1 → 2 → 3 → 4. Phase 1 is just plumbing (no visible change). Phase 2 is testable via curl. Phase 3 is where the user-visible win lands. Phase 4 is polish.
