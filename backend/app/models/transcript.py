from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Transcript(Base):
    """One chunk of Whisper output during a streaming session.

    Sequence is 0-based and unique per session. Out-of-order arrival is
    tolerated at the DB level; the ConsultSession.transcripts relationship
    is ordered by sequence so consumers always see chunks in spoken order.
    """

    __tablename__ = "transcripts"
    __table_args__ = (UniqueConstraint("session_id", "sequence", name="uq_transcripts_session_seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    session: Mapped["ConsultSession"] = relationship(back_populates="transcripts")  # noqa: F821
