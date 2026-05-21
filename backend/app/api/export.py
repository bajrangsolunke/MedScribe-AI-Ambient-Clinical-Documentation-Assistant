from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session as DbSession

from app.database import get_db
from app.deps import get_current_user
from app.models import ConsultSession, User
from app.services.pdf_service import render_session_pdf

router = APIRouter(prefix="/sessions", tags=["export"])


@router.get("/{session_id}/export.pdf")
def export_session_pdf(
    session_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    s = db.get(ConsultSession, session_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    pdf = render_session_pdf(s)
    filename = f"medscribe-session-{session_id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
