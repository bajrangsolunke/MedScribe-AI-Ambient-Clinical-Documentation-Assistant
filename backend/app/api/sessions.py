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
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session as DbSession
from sse_starlette.sse import EventSourceResponse

from app.database import SessionLocal, get_db
from app.deps import get_current_user, get_current_user_eventsource
from app.models import ConsultSession, IcdSuggestion, SessionStatus, SoapNote, User
from app.schemas.session import (
    IcdAcceptedUpdate,
    SessionCreate,
    SessionDetail,
    SessionOut,
    SoapUpdate,
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
