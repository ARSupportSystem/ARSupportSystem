from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.system_config import SingletonConfig


def get_or_create_singleton_config(db: Session) -> SingletonConfig:
    """Return singleton system config row, creating it from defaults when absent."""
    config = db.query(SingletonConfig).filter(SingletonConfig.id == 1).first()
    if config:
        return config

    config = SingletonConfig(id=1, bootstrap_complete=settings.BOOTSTRAP_COMPLETE)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def is_bootstrap_complete(db: Session) -> bool:
    """Resolve whether initial bootstrap has been marked complete."""
    return bool(get_or_create_singleton_config(db).bootstrap_complete)
