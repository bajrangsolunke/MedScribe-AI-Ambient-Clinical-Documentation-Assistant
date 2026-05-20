from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IcdCatalog(Base):
    """Reference table seeded from CMS ICD-10-CM. ~70K rows."""

    __tablename__ = "icd_catalog"

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    short_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    long_description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    chapter: Mapped[str] = mapped_column(Text, nullable=False, default="")
