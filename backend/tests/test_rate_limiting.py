def test_sixth_rapid_login_attempt_returns_429(client, seeded_users):
    attempts = []
    for _ in range(6):
        response = client.post(
            "/api/auth/login",
            json={"email": "admin@test.com", "password": "WrongPassword123!"},
        )
        attempts.append(response)

    for response in attempts[:5]:
        assert response.status_code == 401
    assert attempts[5].status_code == 429


def test_rate_limit_response_body_matches_expected_message(client, seeded_users):
    response = None
    for _ in range(6):
        response = client.post(
            "/api/auth/login",
            json={"email": "admin@test.com", "password": "WrongPassword123!"},
        )

    assert response is not None
    assert response.status_code == 429
    assert response.json() == {"detail": "Too many login attempts. Please wait before trying again."}
