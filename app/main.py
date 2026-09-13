from fastapi import FastAPI

from app.core.exceptions import AppError, app_error_handler
from app.routers import auth, citations

app = FastAPI(title="Citation Tracker", version="0.1.0")

app.add_exception_handler(AppError, app_error_handler)

app.include_router(auth.router)
app.include_router(citations.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
