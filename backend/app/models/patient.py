from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Patient(Base):
    """A patient is owned by a single user (doctor) and groups one or more
    ConsultSession visits.

    No unique constraint on (user_id, full_label) — a doctor may legitimately
    have two patients with the same display name; the UI shows a soft warning
    on apparent duplicates and lets the doctor confirm.
    """

    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    full_label: Mapped[str] = mapped_column(String(120), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="patients")  # noqa: F821
    sessions: Mapped[list["ConsultSession"]] = relationship(  # noqa: F821
        back_populates="patient",
        order_by="ConsultSession.started_at.desc()",
    )
