# MedScribe AI — Sub-project #3: Patient Management

**Date**: 2026-05-21
**Owner**: Bajrang Solunke
**Status**: Approved design, ready for implementation
**Builds on**: [#1 Core Scribe](./2026-05-20-medscribe-core-design.md) and [#2 Live Streaming](./2026-05-21-medscribe-streaming-design.md)

## Context

Until now, every recording starts a fresh session and the doctor re-types a `patient_label` string. When the same patient returns for a follow-up, there is no continuity — prior visits are not surfaced, the doctor cannot see history, and accidental typos in the label silently fragment what should be the same patient's record.

Sub-project #3 introduces the **Patient** entity. A patient owns a set of visits (the existing `ConsultSession` rows). When a patient comes back, the doctor picks them from a list and starts a new visit pre-linked to that patient, with their prior chief complaints and last visit date visible during recording.

## Goals

- Doctor can manage a list of patients (create, view, edit, delete).
- New sessions can be linked to an existing patient (preferred) or to a new patient created on-the-fly.
- Each patient has a detail page showing all their visits with click-through to the session detail.
- The patient header during recording shows context (last visit date, prior chief complaint) when the session is linked.
- Existing un-linked sessions continue to work unchanged — no destructive migration.

## Non-goals

- Real Master Patient Index / MRN integration (out of portfolio scope).
- Cross-doctor patient sharing — each doctor has their own patient list (`user_id` scoped).
- Medical history fields beyond a free-text `notes` blob (no allergies, meds, problem list — that lives in clinical intelligence sub-projects).
- HL7 / FHIR Patient resource export.
- Backfilling existing sessions into auto-created patients (chosen tradeoff — see Locked-in choices).

## Locked-in choices

| Decision | Choice | Why |
|----------|--------|-----|
| Navigation | **Top nav** — add a "Patients" link next to the brand | Smaller change than a full sidebar; sidebar can come later if we want more "EHR feel" |
| Existing sessions | **Stay unlinked** (`patient_id = NULL`); displayed under "Walk-in / no patient" group | Non-destructive, no brittle label-matching backfill |
| Delete behavior | **Block delete when patient has sessions** (returns 409). To wipe, doctor must first delete the sessions. | Prevents accidental loss of clinical records |
| Patient fields | `full_label` (required), `date_of_birth` (optional date), `notes` (optional free text) | Looks clinical without inventing medical schema |
| Session-to-patient link | New nullable `patient_id` FK on `sessions` | Backwards-compatible; new sessions auto-link |
| Migration | Add tables/columns only, no data movement | Existing #1/#2 sessions continue to render |

## Architecture changes

```
Existing flow:
  doctor types patient_label every time → new ConsultSession

New flow:
  doctor opens "Patients" → search or "+ New patient"
    if existing: click patient → "+ New visit" → workspace pre-linked
    if new: fill form → create Patient → "+ New visit" → workspace pre-linked

Patient detail page:
  patient header (label, DOB age, notes)
  + timeline of all their visits (Completed / In-progress / Failed)
  + "+ New visit" button at top
  + "Edit patient" / "Delete patient" actions

Sessions list (existing Dashboard):
  unchanged for now; each row shows linked patient label as a small chip
  (so doctor can navigate from a session row to the patient's page)
```

## Database

### New table — `patients`

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | indexed; each doctor's own list |
| full_label | TEXT | display name; non-PHI demo rule still applies |
| date_of_birth | DATE NULL | optional; rendered as "Age 47 (1979-03-12)" in UI |
| notes | TEXT NULL | free-text doctor notes; multiline ok |
| created_at | DATETIME | server-defaulted |
| updated_at | DATETIME NULL | set on PATCH; NULL if never edited |

No unique constraint on `(user_id, full_label)` — a doctor may legitimately have two patients with the same display name and they'd be distinguished by DOB. Soft warning in UI on duplicate label, hard rejection only at the user's confirmation.

### Modified — `sessions.patient_id`

Add nullable FK to `patients.id`. Cascade on delete is set to `RESTRICT` at the DB level (matching the application-level 409). Indexed for the "list sessions for a patient" query.

### Migration

Single Alembic revision adds the `patients` table + `sessions.patient_id` column. Existing sessions are unaffected (NULL FK). No backfill.

## Backend changes

### New schemas

```python
class PatientCreate(BaseModel):
    full_label: str          # required, len 1..120
    date_of_birth: date | None = None
    notes: str | None = None

class PatientUpdate(BaseModel):
    full_label: str | None = None
    date_of_birth: date | None = None
    notes: str | None = None

class PatientOut(BaseModel):
    id: int
    full_label: str
    date_of_birth: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime | None
    last_visit_at: datetime | None        # derived: most recent session.started_at
    visit_count: int                      # derived: count of sessions

class PatientDetail(PatientOut):
    sessions: list[SessionOut]            # ordered desc by started_at
```

### New endpoints (all under `/patients`)

| Method | Path | Behavior |
|---|---|---|
| GET | `/patients` | List user's patients ordered by `last_visit_at desc, created_at desc`. Derived fields populated. Supports `?q=` for label substring search. |
| POST | `/patients` | Create. Returns `PatientOut` (visit_count=0, last_visit_at=null). |
| GET | `/patients/{id}` | `PatientDetail` with embedded sessions. 404 if not owned. |
| PATCH | `/patients/{id}` | Partial update. Sets `updated_at = now()`. |
| DELETE | `/patients/{id}` | 409 if `visit_count > 0`. Otherwise removes. |

### Modified endpoints

- `POST /sessions` — body gains optional `patient_id: int | None`. If provided, server verifies the patient is owned by the user and sets `session.patient_id`. The existing `patient_label` field is still required (used for display when the session is fetched without joining the patient row) and is normally pre-filled from the patient on the client side.
- `GET /sessions/{id}` and `GET /sessions` — response gains `patient_id: int | None` field. (No embedded patient object — keep payload lean; the client already has the patient context.)

### Authorization

All `/patients/*` endpoints require JWT auth (existing `get_current_user`) and scope to `user_id`. Cross-user access returns 404 (not 403 — prevents enumeration).

## Frontend changes

### New page — `PatientsPage` (`/patients`)

Top-level route. Layout:

```
Header: "Patients" + "+ New patient" button
Search input (filters by label substring)
Card grid (or list — responsive):
  • Patient name (avatar with initials)
  • "Age 47" if DOB set
  • "3 visits · last 5 days ago" meta
  • Truncated notes if present
  → click → /patients/{id}
Empty state: stethoscope icon + "No patients yet" + CTA
```

### New page — `PatientDetailPage` (`/patients/:id`)

```
Back to All patients ← link
Patient header card: name, age, DOB, notes (with "Edit" + "Delete" actions)
"+ New visit" primary button
Visit timeline (vertical, newest first):
  • date / relative time
  • status badge (Completed / Failed / Recording)
  • chief complaint
  • info chips (duration, ICDs count, etc.) — reuses the dashboard meta row
  → click → /sessions/{id} (existing detail page)
```

### Modified — Workspace "New session" form

Today the form has two inputs: `patient_label` + `chief_complaint`. New flow:

1. **Step 1: Pick or create a patient.**
   - Combobox: type to search existing patients (debounced API call). Results dropdown with name + meta.
   - If no match or the user wants new: "+ Create new patient" inline form (just `full_label`, `DOB` and `notes` are optional and skipped at this step).
2. **Step 2: Visit details** (only `chief_complaint`).
3. Submit → `POST /sessions` with `patient_id` + `patient_label` (copied for backwards-compat) + `chief_complaint`.

### Modified — `PatientHeader` (workspace + session detail)

When the session is linked to a patient, the header gains a small "Last visit X days ago" line plus "View patient →" link.

### Modified — Top nav (`AppShell`)

Add "Patients" link next to the wordmark. Highlighted when route starts with `/patients`. (No sidebar — keep the current layout.)

### Modified — Dashboard `SessionRow`

Each row gains a small patient chip — `👤 John D.` — that links to the patient detail. For unlinked sessions, shows "Walk-in" in muted gray.

### API client (`services/api.ts`)

```ts
api.patients = {
  list: (q?: string) => GET /patients?q=...
  create: (data) => POST /patients
  get: (id) => GET /patients/{id}
  update: (id, patch) => PATCH /patients/{id}
  delete: (id) => DELETE /patients/{id}
}
api.sessions.create: now accepts (patient_label, chief_complaint?, patient_id?)
```

## Quality

### Backend tests

| File | New tests |
|---|---|
| `test_patients_api.py` (NEW) | create + me; list returns user's only; get 404 cross-user; PATCH updates updated_at; DELETE 409 when has sessions; DELETE 204 when empty; search by ?q filters; derived `last_visit_at` + `visit_count` correct |
| `test_sessions_api.py` (UPDATED) | session create with `patient_id` links correctly; session create with wrong `patient_id` (other user's) → 404; session payload includes `patient_id` |

Target: ~50 backend tests total after this phase (was 42 + ~8 new).

### Migration safety

Add the new table + column, no data movement. Smoke test: run `alembic upgrade head` against a populated dev DB (with existing #1/#2 sessions), confirm everything still loads and the sessions show `patient_id = null`.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Duplicate patients ("John D." created twice by mistake) | Soft warning in the create form when the typed label matches an existing patient; doctor confirms |
| Existing un-linked sessions look "lost" on the new Patients page | Show them under a "Walk-in / unlinked" group on the Patients page with an "Assign to patient…" action (Phase 4 polish if time allows) |
| Patient deletion accidentally wipes clinical record | 409 by default; explicit `?force=true` query param can be added later if a true "wipe everything" workflow is needed |
| DOB-based age calculation drifts at year boundaries | Use a simple `(today - dob) / 365.25` rounding on the frontend; precision isn't clinically critical here |

## Definition of done

- Doctor can create patients, list them, edit them, delete empty ones.
- New session flow defaults to picking an existing patient.
- Linking the same patient across multiple visits works end-to-end.
- Patient detail page shows full visit history with status badges.
- Existing Sub-project #1 + #2 sessions still render correctly (they show as "Walk-in" / unlinked).
- All backend tests green with mocked Groq; new patient tests included.
- README + roadmap updated.
