from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import IcdCatalog, IcdSuggestion
from app.schemas.icd import IcdCandidate


def validate(
    candidates: list[IcdCandidate],
    session_id: int,
    db: Session,
) -> list[IcdSuggestion]:
    """Convert LLM-produced candidates into IcdSuggestion rows.

    Each candidate's code is looked up in `icd_catalog` (case-insensitive).
    If found, `is_validated=True` and the description is overwritten with the
    catalog's authoritative short_description. Unknown codes are still
    persisted with `is_validated=False` so the user can see what the LLM
    proposed but the catalog rejected.
    """
    rows: list[IcdSuggestion] = []
    for c in candidates:
        code_upper = c.code.strip().upper()
        match = (
            db.query(IcdCatalog)
            .filter(func.upper(IcdCatalog.code) == code_upper)
            .first()
        )
        rows.append(
            IcdSuggestion(
                session_id=session_id,
                code=code_upper,
                description=match.short_description if match else c.description,
                confidence=c.confidence,
                reasoning=c.reasoning,
                is_validated=match is not None,
            )
        )
    return rows
