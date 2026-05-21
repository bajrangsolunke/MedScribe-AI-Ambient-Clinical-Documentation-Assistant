from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import SessionStatus
from app.schemas.icd import IcdSuggestionOut


class SessionCreate(BaseModel):
    patient_label: str
    chief_complaint: str | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_label: str
    chief_complaint: str | None
    status: SessionStatus
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None
    # Derived fields surfaced on the list endpoint so the dashboard can
    # show info-dense cards without N+1 detail fetches.
    icd_count: int = 0
    has_soap: bool = False
    transcript_chars: int = 0
    duration_sec: int | None = None


class SoapPayloadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    subjective: str
    objective: str
    assessment: str
    plan: str
    edited_at: datetime | None


class SessionDetail(SessionOut):
    transcript_text: str | None
    visit_summary: str | None
    soap_note: SoapPayloadOut | None
    icd_suggestions: list[IcdSuggestionOut]


class SoapUpdate(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class IcdUpdate(BaseModel):
    """Partial update for an ICD suggestion. Any field may be omitted."""

    code: str | None = None
    description: str | None = None
    accepted: bool | None = None


class SummaryUpdate(BaseModel):
    summary: str
