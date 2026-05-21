from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.session import SessionOut


class PatientCreate(BaseModel):
    full_label: str = Field(min_length=1, max_length=120)
    date_of_birth: date | None = None
    notes: str | None = None


class PatientUpdate(BaseModel):
    """Partial update — any field may be omitted."""

    full_label: str | None = Field(default=None, min_length=1, max_length=120)
    date_of_birth: date | None = None
    notes: str | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_label: str
    date_of_birth: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime | None
    # Derived from the patient's sessions — populated server-side.
    last_visit_at: datetime | None = None
    visit_count: int = 0


class PatientDetail(PatientOut):
    sessions: list[SessionOut] = []
