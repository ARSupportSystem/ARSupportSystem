from pydantic import BaseModel


class LoginRequest(BaseModel):
    """Used by the JSON /login endpoint (frontend fetch calls)."""
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int   # seconds until expiry — useful for frontend refresh logic
