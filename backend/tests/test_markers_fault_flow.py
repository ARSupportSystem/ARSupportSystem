from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.api.endpoints.faults import create_fault, delete_fault
from app.api.endpoints.markers import create_markers_bulk
from app.models.fault import FaultLocation, FaultSeverity
from app.models.marker import Marker
from app.models.user import User, UserRole
from app.schemas.fault import FaultCreate
from app.schemas.marker import MarkerBulkCreate, MarkerCreate


def _make_db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


def _create_user(db, email: str, role: UserRole) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0],
        hashed_password="hashed",
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_create_fault_requires_registered_marker():
    db = _make_db_session()
    try:
        technician = _create_user(db, "tech1@test.com", UserRole.technician)
        payload = FaultCreate(
            title="Loose cable",
            severity=FaultSeverity.medium,
            location=FaultLocation.station,
            ar_marker_id="unregistered-marker-1",
        )

        try:
            create_fault(payload=payload, db=db, current_user=technician)
            assert False, "Expected marker validation to fail"
        except HTTPException as exc:
            assert exc.status_code == 400
            assert "Marker is not registered" in exc.detail
    finally:
        db.close()


def test_create_fault_with_marker_uses_marker_location_detail():
    db = _make_db_session()
    try:
        admin = _create_user(db, "admin1@test.com", UserRole.admin)
        technician = _create_user(db, "tech2@test.com", UserRole.technician)

        marker = Marker(
            marker_id="flt-100",
            label="Test Marker",
            location_detail="Platform A",
            is_active=True,
            created_by_id=admin.id,
        )
        db.add(marker)
        db.commit()

        payload = FaultCreate(
            title="Brake issue",
            description="Detected vibration",
            severity=FaultSeverity.high,
            location=FaultLocation.vehicle,
            ar_marker_id="flt-100",
        )

        created = create_fault(payload=payload, db=db, current_user=technician)

        assert created["ar_marker_id"] == "flt-100"
        assert created["location_detail"] == "Platform A"
    finally:
        db.close()


def test_bulk_create_markers_rejects_duplicates():
    db = _make_db_session()
    try:
        admin = _create_user(db, "admin2@test.com", UserRole.admin)

        existing_marker = Marker(
            marker_id="dup-1",
            label="Existing",
            is_active=True,
            created_by_id=admin.id,
        )
        db.add(existing_marker)
        db.commit()

        payload = MarkerBulkCreate(markers=[
            MarkerCreate(marker_id="dup-1", label="Duplicate"),
            MarkerCreate(marker_id="unique-2", label="Unique"),
        ])

        try:
            create_markers_bulk(payload=payload, db=db, current_user=admin)
            assert False, "Expected duplicate marker ID error"
        except HTTPException as exc:
            assert exc.status_code == 400
            assert "Duplicate marker IDs" in str(exc.detail)
    finally:
        db.close()


def test_admin_can_delete_fault_and_free_marker_for_new_fault():
    db = _make_db_session()
    try:
        admin = _create_user(db, "admin3@test.com", UserRole.admin)
        technician = _create_user(db, "tech3@test.com", UserRole.technician)

        marker = Marker(
            marker_id="flt-200",
            label="Blank field marker",
            is_active=True,
            created_by_id=admin.id,
        )
        db.add(marker)
        db.commit()

        created = create_fault(
            payload=FaultCreate(
                title="Panel damage",
                severity=FaultSeverity.high,
                location=FaultLocation.station,
                ar_marker_id="flt-200",
            ),
            db=db,
            current_user=technician,
        )

        delete_fault(fault_id=created["id"], db=db, current_user=admin)

        recreated = create_fault(
            payload=FaultCreate(
                title="Replacement report",
                severity=FaultSeverity.low,
                location=FaultLocation.platform,
                ar_marker_id="flt-200",
            ),
            db=db,
            current_user=technician,
        )

        assert recreated["ar_marker_id"] == "flt-200"
        assert recreated["title"] == "Replacement report"
    finally:
        db.close()
