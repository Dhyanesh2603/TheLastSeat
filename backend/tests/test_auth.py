import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient):
    # 1. Register Student
    reg_payload = {
        "email": "teststudent@college.edu",
        "password": "SecurePassword123!",
        "full_name": "Test Student",
        "role": "student"
    }
    res = await client.post("/api/v1/auth/register", json=reg_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "teststudent@college.edu"
    assert data["role"] == "student"

    # 2. Duplicate registration should be rejected with 409
    res_dup = await client.post("/api/v1/auth/register", json=reg_payload)
    assert res_dup.status_code == 409

    # 3. Login
    login_payload = {
        "email": "teststudent@college.edu",
        "password": "SecurePassword123!"
    }
    res_login = await client.post("/api/v1/auth/login", json=login_payload)
    assert res_login.status_code == 200
    token_data = res_login.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # 4. Fetch /me profile
    res_me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200
    assert res_me.json()["email"] == "teststudent@college.edu"
