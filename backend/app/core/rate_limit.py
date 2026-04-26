"""Shared rate-limiting utilities for the FastAPI application."""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a stable security-friendly error payload for rate-limited login attempts."""
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many login attempts. Please wait before trying again."},
    )
