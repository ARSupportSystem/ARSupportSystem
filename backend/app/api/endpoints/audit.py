"""Audit log retrieval endpoints with strict read-only access controls."""

import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/")
def list_audit_logs(
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None, max_length=100),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    ip_address: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.admin)),
) -> dict[str, object]:
    """Return paginated audit logs with optional filters, sorted newest-first."""
    try:
        query = db.query(AuditLog)
        if user_id is not None:
            query = query.filter(AuditLog.user_id == user_id)
        if action:
            query = query.filter(AuditLog.action == action.strip())
        if start_date is not None:
            query = query.filter(AuditLog.timestamp >= start_date)
        if end_date is not None:
            query = query.filter(AuditLog.timestamp <= end_date)
        if ip_address:
            query = query.filter(AuditLog.ip_address == ip_address.strip())

        total = query.count()
        logs = (
            query.order_by(AuditLog.timestamp.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.exception("Failed to list audit logs", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch audit logs")

    return {
        "items": [
            {
                "id": item.id,
                "user_id": item.user_id,
                "action": item.action,
                "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "details": _parse_details(item.details),
                "ip_address": item.ip_address,
                "timestamp": item.timestamp,
            }
            for item in logs
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/security-events")
def list_security_events(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.admin, UserRole.supervisor)),
) -> dict[str, object]:
    """Return paginated recent security-relevant audit events for incident monitoring."""
    effective_start = start_date or (datetime.utcnow() - timedelta(hours=24))
    effective_end = end_date or datetime.utcnow()
    target_actions = (
        "LOGIN_FAILED",
        "UNAUTHORISED_ACCESS_ATTEMPT",
        "BRUTE_FORCE_SUSPECTED",
    )

    try:
        query = db.query(AuditLog).filter(
            AuditLog.action.in_(target_actions),
            AuditLog.timestamp >= effective_start,
            AuditLog.timestamp <= effective_end,
        )
        total = query.count()
        logs = (
            query.order_by(AuditLog.timestamp.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
    except SQLAlchemyError as exc:
        logger.exception("Failed to list security events", exc_info=exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch security events")

    return {
        "items": [
            {
                "id": item.id,
                "user_id": item.user_id,
                "action": item.action,
                "resource_type": item.resource_type,
                "resource_id": item.resource_id,
                "details": _parse_details(item.details),
                "ip_address": item.ip_address,
                "timestamp": item.timestamp,
            }
            for item in logs
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "start_date": effective_start,
        "end_date": effective_end,
    }


def _parse_details(details: str | None) -> dict | None:
    """Parse stored JSON detail payloads safely for API responses."""
    if not details:
        return None
    try:
        return json.loads(details)
    except json.JSONDecodeError:
        return {"raw": details}
