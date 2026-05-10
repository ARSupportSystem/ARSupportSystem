import logging
import ssl
from collections.abc import Awaitable, Callable

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from starlette.responses import Response

from app.api.routes import router as api_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.rate_limit import limiter, rate_limit_exceeded_handler

logger = logging.getLogger(__name__)

import app.models  # noqa: F401

Base.metadata.create_all(bind=engine)


def add_column_if_missing(sql: str) -> None:
    try:
        with engine.connect() as conn:
            conn.execute(text(sql))
            conn.commit()
    except Exception:
        pass


for column_sql in (
    "ALTER TABLE tools ADD COLUMN marker_id TEXT",
    "ALTER TABLE tools ADD COLUMN marker_image TEXT",
    "ALTER TABLE tools ADD COLUMN owner_id INTEGER",
):
    add_column_if_missing(column_sql)


app = FastAPI(
    title=settings.APP_NAME,
    description="AR-Enhanced Maintenance Support System for Public Transport",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    response = await call_next(request)
    is_docs_route = request.url.path in {"/docs", "/redoc", "/openapi.json"}

    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    if is_docs_route:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "connect-src 'self'"
        )
    else:
        response.headers["Content-Security-Policy"] = "default-src 'self'"

    return response


app.include_router(api_router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "app": settings.APP_NAME}


def build_ssl_context() -> ssl.SSLContext | None:
    if not settings.HTTPS_CERT_FILE or not settings.HTTPS_KEY_FILE:
        return None

    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(certfile=settings.HTTPS_CERT_FILE, keyfile=settings.HTTPS_KEY_FILE)
    return context


if __name__ == "__main__":
    ssl_context = build_ssl_context()
    if ssl_context:
        logger.info("Starting API with HTTPS enabled")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=8000,
            ssl_certfile=settings.HTTPS_CERT_FILE,
            ssl_keyfile=settings.HTTPS_KEY_FILE,
        )
    else:
        logger.info("Starting API without HTTPS (no certificate configuration found)")
        uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
