"""End-to-end orchestration of the 5-step scribe pipeline.

Each step:
  1. transcribe        — Groq Whisper on the uploaded audio blob
  2. soap              — LLM generates SOAP from the transcript
  3. icd_candidates    — LLM proposes candidate ICD codes
  4. icd_validated     — Codes are filtered/labeled against the local catalog
  5. summary           — LLM writes a 2-3 sentence patient-friendly summary

On each step boundary, an event is published on `event_bus` so the SSE
endpoint can stream live progress to the browser. Any uncaught exception
flips session status to FAILED and records the error message.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.ai import llm, stt
from app.models import ConsultSession, IcdSuggestion, SessionStatus, SoapNote
from app.prompts.icd import ICD_PROMPT
from app.prompts.soap import SOAP_PROMPT
from app.prompts.summary import SUMMARY_PROMPT
from app.schemas.icd import IcdCandidates
from app.schemas.soap import SoapPayload
from app.schemas.summary import SummaryPayload
from app.services.event_bus import EventBus, event_bus
from app.services.icd_validator import validate as validate_icds

logger = logging.getLogger(__name__)


STAGES = ("transcribe", "soap", "icd_candidates", "icd_validated", "summary")


class ScribePipeline:
    def __init__(self, bus: EventBus | None = None) -> None:
        self.bus = bus or event_bus

    def run(
        self,
        session_id: int,
        audio_bytes: bytes,
        filename: str,
        db: Session,
    ) -> None:
        """Run the pipeline end-to-end. Persists results and emits SSE events.

        Blocking — invoked from a FastAPI BackgroundTask.
        """
        consult = db.get(ConsultSession, session_id)
        if consult is None:
            logger.error("scribe_pipeline: session %s not found", session_id)
            return

        consult.status = SessionStatus.processing
        db.commit()
        self._emit(session_id, "pipeline", "started")

        try:
            # 1. transcribe
            self._emit(session_id, "transcribe", "in_progress")
            transcript = stt.transcribe(audio_bytes, filename)
            consult.transcript_text = transcript
            db.commit()
            self._emit(session_id, "transcribe", "done", {"chars": len(transcript)})

            # 2. SOAP
            self._emit(session_id, "soap", "in_progress")
            soap_payload = llm.complete_json(
                SOAP_PROMPT.format(transcript=transcript), SoapPayload
            )
            soap = SoapNote(
                session_id=session_id,
                subjective=soap_payload.subjective,
                objective=soap_payload.objective,
                assessment=soap_payload.assessment,
                plan=soap_payload.plan,
            )
            db.add(soap)
            db.commit()
            self._emit(session_id, "soap", "done")

            # 3. ICD candidates
            self._emit(session_id, "icd_candidates", "in_progress")
            soap_summary_text = (
                f"S: {soap_payload.subjective}\n"
                f"O: {soap_payload.objective}\n"
                f"A: {soap_payload.assessment}\n"
                f"P: {soap_payload.plan}"
            )
            candidates = llm.complete_json(
                ICD_PROMPT.format(transcript=transcript, soap=soap_summary_text),
                IcdCandidates,
            )
            self._emit(
                session_id, "icd_candidates", "done", {"count": len(candidates.codes)}
            )

            # 4. Validate against catalog
            self._emit(session_id, "icd_validated", "in_progress")
            suggestions: list[IcdSuggestion] = validate_icds(
                candidates.codes, session_id, db
            )
            for s in suggestions:
                db.add(s)
            db.commit()
            validated_count = sum(1 for s in suggestions if s.is_validated)
            self._emit(
                session_id,
                "icd_validated",
                "done",
                {
                    "total": len(suggestions),
                    "validated": validated_count,
                    "dropped": len(suggestions) - validated_count,
                },
            )

            # 5. Summary
            self._emit(session_id, "summary", "in_progress")
            summary_payload = llm.complete_json(
                SUMMARY_PROMPT.format(transcript=transcript, soap=soap_summary_text),
                SummaryPayload,
            )
            consult.visit_summary = summary_payload.summary
            consult.status = SessionStatus.completed
            consult.completed_at = datetime.now(UTC)
            db.commit()
            self._emit(session_id, "summary", "done")
            self._emit(session_id, "pipeline", "complete")

        except Exception as exc:  # noqa: BLE001 — pipeline must catch everything
            logger.exception("scribe_pipeline failed for session %s", session_id)
            consult.status = SessionStatus.failed
            consult.error_message = f"{type(exc).__name__}: {exc}"
            db.commit()
            self._emit(
                session_id,
                "pipeline",
                "error",
                {"message": consult.error_message},
            )

    def _emit(
        self,
        session_id: int,
        stage: str,
        status: str,
        meta: dict[str, Any] | None = None,
    ) -> None:
        event = {
            "stage": stage,
            "status": status,
            "ts": datetime.now(UTC).isoformat(),
        }
        if meta:
            event["meta"] = meta
        self.bus.publish_sync(session_id, event)
