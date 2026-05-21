import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SessionStatus(str, enum.Enum):
    created = "created"
    recording = "recording"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class ConsultSession(Base):
    """A single clinical consultation session.

    Internal class name avoids collision with `sqlalchemy.orm.Session`.
    Table name is `sessions` per the spec.
    """

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    # Nullable FK so existing sessions from #1/#2 stay valid; new sessions
    # link to a Patient via the workspace picker.
    patient_id: Mapped[int | None] = mapped_column(
        ForeignKey("patients.id"), nullable=True, index=True
    )
    patient_label: Mapped[str] = mapped_column(String(120), nullable=False)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status"),
        default=SessionStatus.created,
        nullable=False,
    )
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")  # noqa: F821
    patient: Mapped["Patient | None"] = relationship(back_populates="sessions")  # noqa: F821
    soap_note: Mapped["SoapNote | None"] = relationship(  # noqa: F821
        back_populates="session", cascade="all, delete-orphan", uselist=False
    )
    icd_suggestions: Mapped[list["IcdSuggestion"]] = relationship(  # noqa: F821
        back_populates="session", cascade="all, delete-orphan"
    )
    transcripts: Mapped[list["Transcript"]] = relationship(  # noqa: F821
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Transcript.sequence",
    )
