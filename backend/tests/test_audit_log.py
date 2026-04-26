from app.models.audit_log import AuditLog


def _login(client, email: str, password: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_login_success_writes_audit_log(client, seeded_users, db_session):
    _login(client, "admin@test.com", "AdminSecure123!")

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "LOGIN_SUCCESS")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None


def test_login_failed_writes_audit_log(client, seeded_users, db_session):
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "WrongPassword123!"},
    )
    assert response.status_code == 401

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "LOGIN_FAILED")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None


def test_logout_writes_audit_log(client, seeded_users, db_session):
    token = _login(client, "admin@test.com", "AdminSecure123!")
    logout_response = client.post("/api/auth/logout", headers=_auth_headers(token))
    assert logout_response.status_code == 200

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "LOGOUT")
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None


def test_audit_log_endpoint_returns_403_for_non_admin_users(client, seeded_users):
    supervisor_token = _login(client, "supervisor@test.com", "SupervisorSecure123!")

    response = client.get("/api/audit/", headers=_auth_headers(supervisor_token))
    assert response.status_code == 403
