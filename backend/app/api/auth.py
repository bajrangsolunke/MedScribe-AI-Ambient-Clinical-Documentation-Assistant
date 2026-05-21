from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import (
    GoogleAuthRequest,
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserOut,
)
from app.services.auth_service import create_access_token, hash_password, verify_password
from app.services.google_oauth import GoogleOAuthError, verify_google_id_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.password_hash or not verify_password(
        payload.password, user.password_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/google", response_model=TokenResponse)
def google_sign_in(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Exchange a Google ID token for our own JWT.

    Verifies the token against Google's public keys, then upserts the user
    by email. Existing email/password users automatically get linked — they
    can sign in with either method going forward.
    """
    try:
        identity = verify_google_id_token(payload.id_token)
    except GoogleOAuthError as exc:
        message = str(exc)
        if "not configured" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        raise HTTPException(status_code=401, detail=message) from exc

    user = db.query(User).filter(User.email == identity.email).first()
    if user is None:
        user = User(email=identity.email, password_hash=None)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current)
