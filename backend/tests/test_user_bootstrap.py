from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import patch

from app.core.database import Base
from app.models.user import User, UserRole
from app.schemas.user import UserCreate
import app.api.endpoints.users as users_endpoint


def _make_db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine, tables=[User.__table__])
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return session_local()


def test_first_user_can_be_bootstrapped_without_token_and_is_admin():
    db = _make_db_session()
    try:
        payload = UserCreate(
            email="first-admin@example.com",
            full_name="First Admin",
            password="supersecret",
            role=UserRole.technician,
        )

        with patch.object(users_endpoint, "hash_password", return_value="fake-hash"):
            created = users_endpoint.create_user(payload=payload, db=db, current_user=None)

        assert created.role == UserRole.admin
        assert created.email == "first-admin@example.com"
    finally:
        db.close()


def test_second_user_requires_authentication():
    db = _make_db_session()
    try:
        first_payload = UserCreate(
            email="first-admin@example.com",
            full_name="First Admin",
            password="supersecret",
            role=UserRole.admin,
        )
        with patch.object(users_endpoint, "hash_password", return_value="fake-hash"):
            users_endpoint.create_user(payload=first_payload, db=db, current_user=None)

        second_payload = UserCreate(
            email="second@example.com",
            full_name="Second User",
            password="supersecret",
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
