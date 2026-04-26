from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services.system_config import is_bootstrap_complete

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/status")
def get_system_status(db: Session = Depends(get_db)) -> dict[str, object]:
    """Expose non-sensitive runtime state for frontend setup/login gating."""
    return {
        "bootstrap_complete": is_bootstrap_complete(db),
        "env": settings.ENV,
    }
