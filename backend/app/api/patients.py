from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DbSession, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import ConsultSession, Patient, User
from app.schemas.patient import PatientCreate, PatientDetail, PatientOut, PatientUpdate

router = APIRouter(prefix="/patients", tags=["patients"])


def _serialize_session_summary(s: ConsultSession) -> dict[str, Any]:
    """Lighter session payload for the patient detail page.

    Duplicates a subset of api/sessions._serialize_session — kept local so
    we don't introduce a cross-module dependency just for this view.
    """
    duration_sec: int | None = None
    if s.completed_at and s.started_at:
        duration_sec = max(int((s.completed_at - s.started_at).total_seconds()), 0)
    return {
        "id": s.id,
        "patient_label": s.patient_label,
        "chief_complaint": s.chief_complaint,
        "status": s.status,
        "started_at": s.started_at,
        "completed_at": s.completed_at,
        "error_message": s.error_message,
        "icd_count": len(s.icd_suggestions),
        "has_soap": s.soap_note is not None,
        "transcript_chars": len(s.transcript_text or ""),
        "duration_sec": duration_sec,
        "patient_id": s.patient_id,
    }


def _serialize_patient(p: Patient) -> dict[str, Any]:
    last_visit_at = (
        max((s.started_at for s in p.sessions), default=None)
        if p.sessions
        else None
    )
    return {
        "id": p.id,
        "full_label": p.full_label,
        "date_of_birth": p.date_of_birth,
        "notes": p.notes,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "last_visit_at": last_visit_at,
        "visit_count": len(p.sessions),
    }


def _get_owned_patient(patient_id: int, user: User, db: DbSession) -> Patient:
    p = db.get(Patient, patient_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p


@router.get("", response_model=list[PatientOut])
def list_patients(
    q: str | None = Query(default=None, description="Optional label substring filter"),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    query = (
        db.query(Patient)
        .options(selectinload(Patient.sessions))
        .filter(Patient.user_id == user.id)
    )
    if q:
        query = query.filter(Patient.full_label.ilike(f"%{q.strip()}%"))
    patients = query.all()
    # Sort by last_visit_at desc (None last), then created_at desc.
    rows = [_serialize_patient(p) for p in patients]
    rows.sort(
        key=lambda r: (
            r["last_visit_at"] is None,
            -(r["last_visit_at"].timestamp() if r["last_visit_at"] else 0),
            -r["created_at"].timestamp(),
        )
    )
    return rows


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    p = Patient(
        user_id=user.id,
        full_label=payload.full_label.strip(),
        date_of_birth=payload.date_of_birth,
        notes=payload.notes,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _serialize_patient(p)


@router.get("/{patient_id}", response_model=PatientDetail)
def get_patient(
    patient_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    p = _get_owned_patient(patient_id, user, db)
    out = _serialize_patient(p)
    out["sessions"] = [_serialize_session_summary(s) for s in p.sessions]
    return out


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    payload: PatientUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    p = _get_owned_patient(patient_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    if "full_label" in data:
        p.full_label = data["full_label"].strip()
    if "date_of_birth" in data:
        p.date_of_birth = data["date_of_birth"]
    if "notes" in data:
        p.notes = data["notes"]
    p.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(p)
    return _serialize_patient(p)


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = _get_owned_patient(patient_id, user, db)
    if p.sessions:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete: patient has {len(p.sessions)} visit(s). "
                "Delete the visits first."
            ),
        )
    db.delete(p)
    db.commit()
