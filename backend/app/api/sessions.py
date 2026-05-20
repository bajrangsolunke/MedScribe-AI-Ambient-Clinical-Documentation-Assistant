from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session as DbSession
from sse_starlette.sse import EventSourceResponse

from app.database import SessionLocal, get_db
from app.deps import get_current_user
from app.models import ConsultSession, IcdSuggestion, SessionStatus, SoapNote, User
from app.schemas.session import (
    IcdAcceptedUpdate,
    SessionCreate,
    SessionDetail,
    SessionOut,
    SoapUpdate,
)
from app.services.event_bus import SENTINEL_CLOSE, event_bus
from app.services.scribe_pipeline import ScribePipeline

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_owned_session(session_id: int, user: User, db: DbSession) -> ConsultSession:
    s = db.get(ConsultSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ConsultSession:
    s = ConsultSession(
        user_id=user.id,
        patient_label=payload.patient_label,
        chief_complaint=payload.chief_complaint,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ConsultSession]:
    return (
        db.query(ConsultSession)
        .filter(ConsultSession.user_id == user.id)
        .order_by(ConsultSession.started_at.desc())
        .all()
    )


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ConsultSession:
    return _get_owned_session(session_id, user, db)


def _run_pipeline_in_thread(session_id: int, audio_bytes: bytes, filename: str) -> None:
    """BackgroundTask entrypoint. Opens its own DB session so the request-scoped one is free."""
    db = SessionLocal()
    try:
        ScribePipeline().run(session_id, audio_bytes, filename, db)
    finally:
        db.close()


@router.post("/{session_id}/audio", status_code=status.HTTP_202_ACCEPTED)
async def upload_audio(
    session_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    s = _get_owned_session(session_id, user, db)
    if s.status == SessionStatus.processing:
        raise HTTPException(status_code=409, detail="Session is already processing")

    audio_bytes = await file.read()
    filename = file.filename or f"session-{session_id}.webm"
    background.add_task(_run_pipeline_in_thread, session_id, audio_bytes, filename)
    return {"status": "accepted", "filename": filename}


@router.post("/{session_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_session(
    session_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    s = _get_owned_session(session_id, user, db)
    if s.status != SessionStatus.failed:
        raise HTTPException(status_code=409, detail="Only failed sessions can be retried")

    # Clear prior partial results so the pipeline starts fresh
    s.error_message = None
    s.transcript_text = None
    s.visit_summary = None
    s.status = SessionStatus.created
    if s.soap_note is not None:
        db.delete(s.soap_note)
    for icd in list(s.icd_suggestions):
        db.delete(icd)
    db.commit()

    audio_bytes = await file.read()
    filename = file.filename or f"session-{session_id}.webm"
    background.add_task(_run_pipeline_in_thread, session_id, audio_bytes, filename)
    return {"status": "accepted", "filename": filename}


@router.get("/{session_id}/stream")
async def stream_session(
    session_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    _get_owned_session(session_id, user, db)
    q = event_bus.queue_for(session_id)

    async def gen() -> AsyncGenerator[dict[str, str], None]:
        while True:
            try:
                event = await asyncio.to_thread(q.get, True, 30)
            except Exception:  # queue.Empty after timeout
                # Heartbeat to keep the connection open
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
) -> ConsultSession:
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
    return s


@router.patch("/{session_id}/icd/{icd_id}", response_model=SessionDetail)
def set_icd_accepted(
    session_id: int,
    icd_id: int,
    payload: IcdAcceptedUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ConsultSession:
    s = _get_owned_session(session_id, user, db)
    icd = db.get(IcdSuggestion, icd_id)
    if icd is None or icd.session_id != s.id:
        raise HTTPException(status_code=404, detail="ICD suggestion not found")
    icd.accepted_by_user = payload.accepted
    db.commit()
    db.refresh(s)
    return s
