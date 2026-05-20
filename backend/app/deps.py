from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _user_from_token(token: str, db: Session) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = decode_access_token(token)
    except ValueError as exc:
        raise credentials_exc from exc
    user = db.get(User, int(user_id))
    if user is None:
        raise credentials_exc
    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _user_from_token(token, db)


def get_current_user_eventsource(
    request: Request,
    access_token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Auth for SSE endpoints. Browser EventSource cannot set headers,
    so accept the JWT via `?access_token=` query param. Falls back to the
    standard Authorization header if present (e.g., for curl/tests).
    """
    token: str | None = access_token
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _user_from_token(token, db)
