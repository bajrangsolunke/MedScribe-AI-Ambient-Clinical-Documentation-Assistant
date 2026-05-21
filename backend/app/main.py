from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_router
from app.api import export as export_router
from app.api import sessions as sessions_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(title="MedScribe AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(sessions_router.router)
app.include_router(export_router.router)


@app.get("/")
def health() -> dict[str, bool]:
    return {"ok": True}
