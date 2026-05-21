from sqlalchemy.orm import Session as DbSession

from app.models import IcdCatalog, User
from app.schemas.icd import IcdCandidate
from app.services.icd_validator import validate


def _seed_user_and_session(db: DbSession) -> int:
    from app.models import ConsultSession

    user = User(email="u@example.com", password_hash="x")
    db.add(user)
    db.commit()
    db.refresh(user)

    s = ConsultSession(user_id=user.id, patient_label="Patient #1")
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


def _seed_catalog(db: DbSession) -> None:
    db.add(
        IcdCatalog(
            code="R07.9",
            short_description="Chest pain, unspecified",
            long_description="Chest pain, unspecified",
            chapter="Symptoms",
        )
    )
    db.commit()


def test_real_code_is_validated(db_session: DbSession) -> None:
    _seed_catalog(db_session)
    sid = _seed_user_and_session(db_session)
    candidates = [
        IcdCandidate(code="R07.9", description="chest pain", confidence=0.9, reasoning="x")
    ]
    rows = validate(candidates, sid, db_session)
    assert len(rows) == 1
    assert rows[0].is_validated is True
    assert rows[0].description == "Chest pain, unspecified"  # overwritten from catalog


def test_fake_code_is_kept_but_unvalidated(db_session: DbSession) -> None:
    _seed_catalog(db_session)
    sid = _seed_user_and_session(db_session)
    candidates = [
        IcdCandidate(code="X99.99", description="made up", confidence=0.5, reasoning="x")
    ]
    rows = validate(candidates, sid, db_session)
    assert len(rows) == 1
    assert rows[0].is_validated is False
    assert rows[0].description == "made up"  # candidate description preserved


def test_validation_is_case_insensitive(db_session: DbSession) -> None:
    _seed_catalog(db_session)
    sid = _seed_user_and_session(db_session)
    candidates = [
        IcdCandidate(code="r07.9", description="lowercase", confidence=0.7, reasoning="x")
    ]
    rows = validate(candidates, sid, db_session)
    assert rows[0].is_validated is True
    assert rows[0].code == "R07.9"  # normalized to uppercase
