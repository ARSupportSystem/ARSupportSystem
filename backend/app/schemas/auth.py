from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    """Used by the JSON /login endpoint (frontend fetch calls)."""
    model_config = ConfigDict(from_attributes=True)

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    """JWT token payload returned by authentication endpoints."""
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    token_type: str = "bearer"
    expires_in: int   # seconds until expiry — useful for frontend refresh logic
