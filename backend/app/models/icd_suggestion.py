from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class IcdSuggestion(Base):
    __tablename__ = "icd_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    accepted_by_user: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    session: Mapped["ConsultSession"] = relationship(back_populates="icd_suggestions")  # noqa: F821
