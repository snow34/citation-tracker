from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.exceptions import AppError, app_error_handler
from app.routers import auth, citations

settings = get_settings()

app = FastAPI(title="Citation Tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)

app.include_router(auth.router)
app.include_router(citations.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
