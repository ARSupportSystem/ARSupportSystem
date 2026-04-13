"""
Audit log endpoint (Cyber Security pathway).

GET /api/audit — paginated audit log (admin/supervisor only)
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.api.deps import require_supervisor_or_admin

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit_logs(
    action: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    resource_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_supervisor_or_admin),
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if resource_type:
        q = q.filter(AuditLog.resource_type == resource_type)

    total = q.count()
    logs = q.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "timestamp": log.timestamp,
            }
            for log in logs
        ],
    }
