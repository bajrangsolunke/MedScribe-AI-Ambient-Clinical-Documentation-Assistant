from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession, selectinload
from sse_starlette.sse import EventSourceResponse

from app.database import SessionLocal, get_db
from app.deps import get_current_user, get_current_user_eventsource
from app.models import ConsultSession, IcdCatalog, IcdSuggestion, SessionStatus, SoapNote, User
from app.schemas.session import (
    IcdUpdate,
    SessionCreate,
    SessionDetail,
    SessionOut,
    SoapUpdate,
    SummaryUpdate,
)
from app.schemas.transcript import ChunkUploadResponse
from app.services.chunk_transcriber import transcribe_chunk
from app.services.event_bus import SENTINEL_CLOSE, event_bus
from app.services.finalize_pipeline import FinalizePipeline

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_owned_session(session_id: int, user: User, db: DbSession) -> ConsultSession:
    s = db.get(ConsultSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


def _serialize_session(s: ConsultSession) -> dict[str, Any]:
    """Build a SessionOut/SessionDetail-compatible dict from an ORM row.

    Derives icd_count / has_soap / transcript_chars / duration_sec so the
    dashboard can render info-dense cards without separate detail fetches.
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
    }


def _serialize_session_detail(s: ConsultSession) -> dict[str, Any]:
    out = _serialize_session(s)
    out["transcript_text"] = s.transcript_text
    out["visit_summary"] = s.visit_summary
    out["soap_note"] = s.soap_note
    out["icd_suggestions"] = s.icd_suggestions
    return out


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    s = ConsultSession(
        user_id=user.id,
        patient_label=payload.patient_label,
        chief_complaint=payload.chief_complaint,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize_session(s)


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    sessions = (
        db.query(ConsultSession)
        .options(
            selectinload(ConsultSession.soap_note),
            selectinload(ConsultSession.icd_suggestions),
        )
        .filter(ConsultSession.user_id == user.id)
        .order_by(ConsultSession.started_at.desc())
        .all()
    )
    return [_serialize_session(s) for s in sessions]


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return _serialize_session_detail(_get_owned_session(session_id, user, db))


@router.post(
    "/{session_id}/audio-chunk",
    response_model=ChunkUploadResponse,
    status_code=status.HTTP_200_OK,
)
async def upload_audio_chunk(
    session_id: int,
    file: UploadFile = File(...),
    sequence: int = Form(...),
    duration_ms: int | None = Form(None),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChunkUploadResponse:
    s = _get_owned_session(session_id, user, db)
    if s.status not in (SessionStatus.created, SessionStatus.recording):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot upload chunk: session status is {s.status.value}",
        )

    audio_bytes = await file.read()
    filename = file.filename or f"session-{session_id}-seq-{sequence}.webm"

    fragment = transcribe_chunk(
        session_id=session_id,
        audio_bytes=audio_bytes,
        sequence=sequence,
        filename=filename,
        db=db,
        duration_ms=duration_ms,
    )
    db.refresh(s)
    return ChunkUploadResponse(
        sequence=fragment.sequence,
        text=fragment.text,
        transcript_so_far=s.transcript_text or "",
    )


def _run_finalize_in_thread(session_id: int) -> None:
    """BackgroundTask entrypoint: opens its own DB session for thread-safety."""
    db = SessionLocal()
    try:
        FinalizePipeline().run(session_id, db)
    finally:
        db.close()


@router.post("/{session_id}/finalize", status_code=status.HTTP_202_ACCEPTED)
def finalize_session(
    session_id: int,
    background: BackgroundTasks,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    s = _get_owned_session(session_id, user, db)
    if s.status != SessionStatus.recording:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot finalize: session status is {s.status.value} (need 'recording')",
        )
    if not s.transcript_text:
        raise HTTPException(
            status_code=400,
            detail="Cannot finalize: transcript is empty",
        )
    background.add_task(_run_finalize_in_thread, session_id)
    return {"status": "accepted"}


@router.post("/{session_id}/retry-finalize", status_code=status.HTTP_202_ACCEPTED)
def retry_finalize(
    session_id: int,
    background: BackgroundTasks,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Re-run the finalize pipeline on a failed session.

    Clears any partial SOAP / ICD rows so the new run starts clean.
    Requires status=failed and a non-empty transcript.
    """
    s = _get_owned_session(session_id, user, db)
    if s.status != SessionStatus.failed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot retry: session status is {s.status.value} (need 'failed')",
        )
    if not s.transcript_text:
        raise HTTPException(
            status_code=400,
            detail="Cannot retry: transcript is empty (delete and re-record instead)",
        )

    # Wipe partial outputs so the re-run starts from a clean slate.
    if s.soap_note is not None:
        db.delete(s.soap_note)
    for icd in list(s.icd_suggestions):
        db.delete(icd)
    s.visit_summary = None
    s.error_message = None
    s.status = SessionStatus.recording  # finalize endpoint expects this
    db.commit()

    background.add_task(_run_finalize_in_thread, session_id)
    return {"status": "accepted"}


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    s = _get_owned_session(session_id, user, db)
    db.delete(s)  # cascade clears soap_note, icd_suggestions, transcripts
    db.commit()
    event_bus.drop(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{session_id}/stream")
async def stream_session(
    session_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user_eventsource),
) -> EventSourceResponse:
    _get_owned_session(session_id, user, db)
    q = event_bus.queue_for(session_id)

    async def gen() -> AsyncGenerator[dict[str, str], None]:
        while True:
            try:
                event = await asyncio.to_thread(q.get, True, 30)
            except Exception:  # queue.Empty after timeout
                yield {"event": "ping", "data": "{}"}
                continue
            if event is SENTINEL_CLOSE:
                event_bus.drop(session_id)
                break
            yield {
                "event": f"{event['stage']}:{event['status']}",
                "data": json.dumps(event),
            }

    return EventSourceResponse(gen())


@router.patch("/{session_id}/soap", response_model=SessionDetail)
def update_soap(
    session_id: int,
    payload: SoapUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    s = _get_owned_session(session_id, user, db)
    if s.soap_note is None:
        s.soap_note = SoapNote(session_id=s.id, **payload.model_dump())
        db.add(s.soap_note)
    else:
        s.soap_note.subjective = payload.subjective
        s.soap_note.objective = payload.objective
        s.soap_note.assessment = payload.assessment
        s.soap_note.plan = payload.plan
        s.soap_note.edited_at = datetime.now(UTC)
    db.commit()
    db.refresh(s)
    return _serialize_session_detail(s)


@router.patch("/{session_id}/icd/{icd_id}", response_model=SessionDetail)
def update_icd(
    session_id: int,
    icd_id: int,
    payload: IcdUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Partial update of an ICD suggestion.

    Any combination of `code`, `description`, `accepted` may be supplied.
    When `code` changes, we re-validate it against the local CMS catalog:
    is_validated flips accordingly, and if the new code is in the catalog
    AND the client didn't override description, we adopt the authoritative
    short_description.
    """
    s = _get_owned_session(session_id, user, db)
    icd = db.get(IcdSuggestion, icd_id)
    if icd is None or icd.session_id != s.id:
        raise HTTPException(status_code=404, detail="ICD suggestion not found")

    if payload.code is not None:
        new_code = payload.code.strip().upper()
        if not new_code:
            raise HTTPException(status_code=400, detail="ICD code cannot be empty")
        icd.code = new_code
        match = (
            db.query(IcdCatalog)
            .filter(func.upper(IcdCatalog.code) == new_code)
            .first()
        )
        icd.is_validated = match is not None
        if match is not None and payload.description is None:
            icd.description = match.short_description

    if payload.description is not None:
        icd.description = payload.description.strip()

    if payload.accepted is not None:
        icd.accepted_by_user = payload.accepted

    db.commit()
    db.refresh(s)
    return _serialize_session_detail(s)


@router.delete("/{session_id}/icd/{icd_id}", response_model=SessionDetail)
def delete_icd(
    session_id: int,
    icd_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    s = _get_owned_session(session_id, user, db)
    icd = db.get(IcdSuggestion, icd_id)
    if icd is None or icd.session_id != s.id:
        raise HTTPException(status_code=404, detail="ICD suggestion not found")
    db.delete(icd)
    db.commit()
    db.refresh(s)
    return _serialize_session_detail(s)


@router.patch("/{session_id}/summary", response_model=SessionDetail)
def update_summary(
    session_id: int,
    payload: SummaryUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    s = _get_owned_session(session_id, user, db)
    s.visit_summary = payload.summary
    db.commit()
    db.refresh(s)
    return _serialize_session_detail(s)
