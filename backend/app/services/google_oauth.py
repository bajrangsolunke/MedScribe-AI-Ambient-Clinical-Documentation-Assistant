"""Google OAuth ID token verification.

The frontend uses Google Identity Services to obtain an ID token from the
browser, then POSTs it to our /auth/google endpoint. This module verifies
the token against Google's published public keys and returns the
authenticated email.

Verification covers: signature, expiry, issuer ("accounts.google.com" or
"https://accounts.google.com"), and audience (must equal our client ID).
"""

from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import get_settings


class GoogleOAuthError(ValueError):
    """Raised when an ID token is invalid, expired, or for the wrong client."""


@dataclass(frozen=True)
class GoogleIdentity:
    email: str
    email_verified: bool
    name: str | None
    picture: str | None
    sub: str  # Google's stable per-user ID


def verify_google_id_token(token: str) -> GoogleIdentity:
    settings = get_settings()
    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        raise GoogleOAuthError("Google OAuth is not configured on this server")
    try:
        info = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
    except ValueError as exc:  # invalid signature/expiry/audience etc.
        raise GoogleOAuthError(f"Invalid Google ID token: {exc}") from exc

    email = info.get("email")
    if not email:
        raise GoogleOAuthError("Google token missing email")
    if not info.get("email_verified", False):
        raise GoogleOAuthError("Google account email is not verified")

    return GoogleIdentity(
        email=email,
        email_verified=True,
        name=info.get("name"),
        picture=info.get("picture"),
        sub=info["sub"],
    )
