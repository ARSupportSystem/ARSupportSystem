from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.endpoints import faults as faults_endpoint
from app.api.endpoints import markers as markers_endpoint
from app.api.endpoints import tools as tools_endpoint
from app.core.database import Base
import app.models  # noqa: F401 - register all SQLAlchemy models
from app.models.audit_log import AuditLog
from app.models.fault import FaultLocation, FaultSeverity
from app.models.marker import Marker
from app.models.tool import Tool
from app.models.user import User, UserRole
from app.schemas.fault import FaultCreate
from app.schemas.marker import MarkerCreate
from app.schemas.tool import ToolSessionComplete, ToolSessionCreate


def _make_db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


def _user(db, email, role=UserRole.technician):
    user = User(
        email=email,
        full_name=email.split("@")[0],
        hashed_password="fake-hash",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_create_fault_writes_audit_event():
    db = _make_db_session()
    try:
        admin = _user(db, "admin-audit@example.com", UserRole.admin)
        tech = _user(db, "tech-audit@example.com")
        db.add(Marker(marker_id="audit-fault-1", is_active=True, created_by_id=admin.id))
        db.commit()

        fault = faults_endpoint.create_fault(
            payload=FaultCreate(
                title="Audit tracked fault",
                severity=FaultSeverity.high,
                location=FaultLocation.platform,
                ar_marker_id="audit-fault-1",
            ),
            db=db,
            current_user=tech,
        )

        event = db.query(AuditLog).filter(AuditLog.action == "FAULT_CREATED").one()
        assert event.user_id == tech.id
        assert event.resource_type == "fault"
        assert event.resource_id == fault["id"]
        assert "audit-fault-1" in event.details
    finally:
        db.close()


def test_marker_create_writes_audit_event():
    db = _make_db_session()
    try:
        admin = _user(db, "marker-admin@example.com", UserRole.admin)

        marker = markers_endpoint.create_marker(
            payload=MarkerCreate(marker_id="audit-marker-1", label="Audit marker"),
            db=db,
            current_user=admin,
        )

        event = db.query(AuditLog).filter(AuditLog.action == "MARKER_CREATED").one()
        assert event.user_id == admin.id
        assert event.resource_type == "marker"
        assert event.resource_id == marker["id"]
        assert "audit-marker-1" in event.details
    finally:
        db.close()


def test_tool_session_completion_writes_audit_event_and_flags_missing_items():
    db = _make_db_session()
    try:
        tech = _user(db, "tool-tech@example.com")
        tool = Tool(name="Torque wrench", marker_id="12", owner_id=tech.id)
        db.add(tool)
        db.commit()
        db.refresh(tool)

        session = tools_endpoint.create_session(
            payload=ToolSessionCreate(
                session_name="Audit session",
                items=[{"tool_id": tool.id, "expected_count": 1}],
            ),
            db=db,
            current_user=tech,
        )

        completed = tools_endpoint.complete_session(
            session_id=session.id,
            payload=ToolSessionComplete(verified_items=[]),
            db=db,
            current_user=tech,
        )

        event = db.query(AuditLog).filter(AuditLog.action == "TOOL_SESSION_COMPLETED").one()
        assert completed.status.value == "incomplete"
        assert event.user_id == tech.id
        assert event.resource_type == "tool_session"
        assert event.resource_id == session.id
        assert str(tool.id) in event.details
    finally:
        db.close()
