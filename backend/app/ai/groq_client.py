from functools import lru_cache

from groq import Groq

from app.config import get_settings


@lru_cache
def get_client() -> Groq:
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it to your .env file or environment."
        )
    return Groq(api_key=settings.GROQ_API_KEY)
