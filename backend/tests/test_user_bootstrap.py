from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import patch

from app.core.database import Base
from app.models.audit_log import AuditLog
from app.models.system_config import SingletonConfig
from app.models.user import User, UserRole
from app.schemas.user import UserCreate
import app.api.endpoints.users as users_endpoint


def _make_db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine, tables=[User.__table__, AuditLog.__table__, SingletonConfig.__table__])
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


def test_first_user_can_be_bootstrapped_without_token_and_is_admin():
    db = _make_db_session()
    try:
        payload = UserCreate(
            email="first-admin@example.com",
            full_name="First Admin",
            password="TestPassword123!",
            role=UserRole.technician,
        )

        with patch.object(users_endpoint, "hash_password", return_value="fake-hash"):
            created = users_endpoint.create_user(payload=payload, db=db, current_user=None)

        assert created.role == UserRole.admin
        assert created.email == "first-admin@example.com"
        singleton = db.query(SingletonConfig).filter(SingletonConfig.id == 1).first()
        assert singleton is not None
        assert singleton.bootstrap_complete is True
    finally:
        db.close()


def test_second_user_requires_authentication():
    db = _make_db_session()
    try:
        first_payload = UserCreate(
            email="first-admin@example.com",
            full_name="First Admin",
            password="TestPassword123!",
            role=UserRole.admin,
        )
        with patch.object(users_endpoint, "hash_password", return_value="fake-hash"):
            users_endpoint.create_user(payload=first_payload, db=db, current_user=None)

        second_payload = UserCreate(
            email="second@example.com",
            full_name="Second User",
            password="TestPassword123!",
            role=UserRole.technician,
        )

        try:
            users_endpoint.create_user(payload=second_payload, db=db, current_user=None)
            assert False, "Expected HTTPException for unauthenticated second user creation"
        except HTTPException as exc:
            assert exc.status_code == 401
            assert exc.detail == "Not authenticated"
    finally:
        db.close()


def test_bootstrap_path_disabled_when_singleton_marks_complete():
    db = _make_db_session()
    try:
        db.add(SingletonConfig(id=1, bootstrap_complete=True))
        db.commit()

        payload = UserCreate(
            email="first-admin@example.com",
            full_name="First Admin",
            password="TestPassword123!",
            role=UserRole.admin,
        )

        try:
            users_endpoint.create_user(payload=payload, db=db, current_user=None)
            assert False, "Expected HTTPException when bootstrap is marked complete"
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == "Bootstrap complete. Admin authentication is required to create users."
    finally:
        db.close()
