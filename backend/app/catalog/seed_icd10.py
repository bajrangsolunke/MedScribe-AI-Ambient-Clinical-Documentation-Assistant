"""Seed the icd_catalog table from a TSV file.

Run as:  python -m app.catalog.seed_icd10
Idempotent: if any rows already exist, exits without re-loading.

The vendored TSV at `app/catalog/icd10_sample.tsv` ships ~50 common codes
covering chest pain, headache, hypertension, diabetes, URI, GERD, low
back pain, anxiety, depression, etc. — enough for development and the
demo scripts. Swap in the full CMS ICD-10-CM TSV (~70K rows) at the
same path for production-realistic coverage.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from app.database import SessionLocal
from app.models import IcdCatalog

DEFAULT_TSV = Path(__file__).parent / "icd10_sample.tsv"


def seed(tsv_path: Path = DEFAULT_TSV) -> int:
    """Returns the number of rows inserted (0 if already seeded)."""
    db = SessionLocal()
    try:
        existing = db.query(IcdCatalog).count()
        if existing > 0:
            print(f"icd_catalog already populated ({existing} rows) — skipping.")
            return 0

        rows: list[IcdCatalog] = []
        with tsv_path.open(encoding="utf-8") as fh:
            reader = csv.DictReader(fh, delimiter="\t")
            for r in reader:
                rows.append(
                    IcdCatalog(
                        code=r["code"].strip().upper(),
                        short_description=r.get("short_description", "").strip(),
                        long_description=r.get("long_description", "").strip(),
                        chapter=r.get("chapter", "").strip(),
                    )
                )

        db.add_all(rows)
        db.commit()
        print(f"Seeded {len(rows)} ICD-10 codes from {tsv_path}.")
        return len(rows)
    finally:
        db.close()


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TSV
    seed(path)
