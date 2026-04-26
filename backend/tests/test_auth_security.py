from app.core.security import decode_access_token, revoke_token


def _login(client, email: str, password: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_login_wrong_password_returns_401(client, seeded_users):
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "WrongPassword123!"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_revoked_token_is_rejected_on_protected_endpoint(client, seeded_users, db_session):
    token = _login(client, "admin@test.com", "AdminSecure123!")
    payload = decode_access_token(token)
    assert payload is not None
    revoke_token(str(payload["jti"]), db_session)

    me_response = client.get("/api/auth/me", headers=_auth_headers(token))
    assert me_response.status_code == 401


def test_logout_revokes_token_and_followup_request_returns_401(client, seeded_users):
    token = _login(client, "admin@test.com", "AdminSecure123!")

    logout_response = client.post("/api/auth/logout", headers=_auth_headers(token))
    assert logout_response.status_code == 200

    me_response = client.get("/api/auth/me", headers=_auth_headers(token))
    assert me_response.status_code == 401


def test_technician_cannot_access_admin_only_endpoint(client, seeded_users):
    technician_token = _login(client, "tech@test.com", "TechSecure123!")

    response = client.get("/api/audit/", headers=_auth_headers(technician_token))
    assert response.status_code == 403


def test_supervisor_cannot_access_admin_only_endpoint(client, seeded_users):
    supervisor_token = _login(client, "supervisor@test.com", "SupervisorSecure123!")

    response = client.get("/api/audit/", headers=_auth_headers(supervisor_token))
    assert response.status_code == 403
