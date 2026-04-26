from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints import auth as auth_endpoints
from app.core.database import Base, get_db
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.main import app
from app.models.system_config import SingletonConfig
from app.models.user import User, UserRole

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def reset_runtime_state():
    auth_endpoints._failed_logins.clear()
    auth_endpoints._bruteforce_audit_window.clear()

    try:
        limiter._storage.reset()
    except Exception:
        try:
            limiter._storage.clear()
        except Exception:
            pass


@pytest.fixture
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def seeded_users(db_session):
    now = datetime.utcnow()
    admin = User(
        email="admin@test.com",
        full_name="Admin User",
        role=UserRole.admin,
        hashed_password=hash_password("AdminSecure123!"),
        is_active=True,
        created_at=now,
    )
    supervisor = User(
        email="supervisor@test.com",
        full_name="Supervisor User",
        role=UserRole.supervisor,
        hashed_password=hash_password("SupervisorSecure123!"),
        is_active=True,
        created_at=now,
    )
    technician = User(
        email="tech@test.com",
        full_name="Technician User",
        role=UserRole.technician,
        hashed_password=hash_password("TechSecure123!"),
        is_active=True,
        created_at=now,
    )
    db_session.add_all([admin, supervisor, technician])
    db_session.add(SingletonConfig(id=1, bootstrap_complete=True))
    db_session.commit()
    db_session.refresh(admin)
    db_session.refresh(supervisor)
    db_session.refresh(technician)

    return {
        "admin": admin,
        "supervisor": supervisor,
        "technician": technician,
    }
