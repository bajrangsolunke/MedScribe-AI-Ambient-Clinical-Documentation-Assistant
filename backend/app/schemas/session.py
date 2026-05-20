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


class IcdAcceptedUpdate(BaseModel):
    accepted: bool
