"""
Tool inventory and tool-session tracking endpoints.

GET    /api/tools                         — list tools
POST   /api/tools                         — register a new tool
GET    /api/tools/{id}                    — get tool
PUT    /api/tools/{id}                    — update tool
DELETE /api/tools/{id}                    — remove tool (admin)

GET    /api/tools/sessions                — list sessions
POST   /api/tools/sessions               — start a new tool-check session
GET    /api/tools/sessions/{id}           — get session detail
PATCH  /api/tools/sessions/{id}/complete  — complete session & verify counts
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.fault import Fault
from app.models.tool import Tool, ToolSession, ToolSessionItem, ToolSessionStatus, ToolAction
from app.schemas.tool import (
    ToolCreate, ToolUpdate, ToolResponse,
    ToolSessionCreate, ToolSessionComplete, ToolSessionResponse,
    ToolActionCreate, ToolActionResponse,
)
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/tools", tags=["tools"])


def _assert_marker_unique(db: Session, marker_id: str, exclude_tool_id: int = None) -> None:
    """Raise 400 if marker_id is already assigned to another tool or any fault."""
    tool_q = db.query(Tool).filter(Tool.marker_id == marker_id)
    if exclude_tool_id:
        tool_q = tool_q.filter(Tool.id != exclude_tool_id)
    if tool_q.first():
        raise HTTPException(status_code=400, detail="Marker is already assigned to another tool.")

    if db.query(Fault).filter(Fault.ar_marker_id == marker_id).first():
        raise HTTPException(status_code=400, detail="Marker is already assigned to a fault.")


# ── Tool CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[ToolResponse])
def list_tools(
    available_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Tool)
    if available_only:
        q = q.filter(Tool.is_available == True)
    return q.all()


@router.post("/action", response_model=ToolActionResponse, status_code=status.HTTP_201_CREATED)
def log_tool_action(
    payload: ToolActionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tool = db.query(Tool).filter(Tool.id == payload.tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")

    ts = datetime.fromisoformat(payload.timestamp) if payload.timestamp else datetime.utcnow()
    action = ToolAction(
        tool_id=payload.tool_id,
        user_id=current_user.id,
        action=payload.action,
        timestamp=ts,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


@router.post("", response_model=ToolResponse, status_code=status.HTTP_201_CREATED)
def create_tool(
    payload: ToolCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if payload.serial_number:
        if db.query(Tool).filter(Tool.serial_number == payload.serial_number).first():
            raise HTTPException(status_code=400, detail="Serial number already exists")
    if payload.marker_id:
        _assert_marker_unique(db, payload.marker_id)
    tool = Tool(**payload.model_dump())
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return tool


@router.get("/sessions", response_model=List[ToolSessionResponse])
def list_sessions(
    technician_id: Optional[int] = Query(None),
    session_status: Optional[ToolSessionStatus] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ToolSession)
    # Technicians only see their own sessions
    if current_user.role == UserRole.technician:
        q = q.filter(ToolSession.technician_id == current_user.id)
    elif technician_id:
        q = q.filter(ToolSession.technician_id == technician_id)
    if session_status:
        q = q.filter(ToolSession.status == session_status)
    return q.order_by(ToolSession.started_at.desc()).all()


@router.post("/sessions", response_model=ToolSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: ToolSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = ToolSession(
        session_name=payload.session_name,
        technician_id=current_user.id,
        fault_id=payload.fault_id,
        notes=payload.notes,
    )
    db.add(session)
    db.flush()  # Get the session.id before committing

    for item_data in payload.items:
        tool = db.query(Tool).filter(Tool.id == item_data.tool_id).first()
        if not tool:
            raise HTTPException(status_code=400, detail=f"Tool id={item_data.tool_id} not found")
        db.add(ToolSessionItem(
            session_id=session.id,
            tool_id=item_data.tool_id,
            expected_count=item_data.expected_count,
        ))

    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions/{session_id}", response_model=ToolSessionResponse)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ToolSession).filter(ToolSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role == UserRole.technician and session.technician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return session


@router.patch("/sessions/{session_id}/complete", response_model=ToolSessionResponse)
def complete_session(
    session_id: int,
    payload: ToolSessionComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record actual tool counts and close the session."""
    session = db.query(ToolSession).filter(ToolSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != ToolSessionStatus.active:
        raise HTTPException(status_code=400, detail="Session is already completed")
    if current_user.role == UserRole.technician and session.technician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    verified_map = {v.tool_id: v.actual_count for v in payload.verified_items}
    all_verified = True

    for item in session.items:
        actual = verified_map.get(item.tool_id)
        if actual is not None:
            item.actual_count = actual
            item.is_verified = actual >= item.expected_count
            if not item.is_verified:
                all_verified = False

    session.status = ToolSessionStatus.completed if all_verified else ToolSessionStatus.incomplete
    session.completed_at = datetime.utcnow()
    if payload.notes:
        session.notes = payload.notes

    db.commit()
    db.refresh(session)
    return session


@router.get("/{tool_id}", response_model=ToolResponse)
def get_tool(
    tool_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool


@router.put("/{tool_id}", response_model=ToolResponse)
def update_tool(
    tool_id: int,
    payload: ToolUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    update_data = payload.model_dump(exclude_none=True)
    if "marker_id" in update_data and update_data["marker_id"]:
        _assert_marker_unique(db, update_data["marker_id"], exclude_tool_id=tool_id)
    for field, value in update_data.items():
        setattr(tool, field, value)
    db.commit()
    db.refresh(tool)
    return tool


@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tool(
    tool_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    db.delete(tool)
    db.commit()
