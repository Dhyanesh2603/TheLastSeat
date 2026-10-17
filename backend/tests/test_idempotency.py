import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.seat_repository import seat_repo

@pytest.mark.asyncio
async def test_idempotency_key_prevents_duplicate_reservation(client: AsyncClient, db_session: AsyncSession):
    await seat_repo.seed_seats_if_empty(db_session, total_seats=5)

    # Register user
    reg = await client.post("/api/v1/auth/register", json={
        "email": "idemp_user@college.edu",
        "password": "Password123!",
        "full_name": "Idemp User",
        "role": "student"
    })
    token = (await client.post("/api/v1/auth/login", json={
        "email": "idemp_user@college.edu",
        "password": "Password123!"
    })).json()["access_token"]

    idempotency_key = "test-key-uuid-12345"

    # First reservation attempt with Idempotency-Key
    res1 = await client.post(
        "/api/v1/seats/2/reserve",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": idempotency_key
        }
    )
    assert res1.status_code == 200
    data1 = res1.json()

    # Repeated request with same Idempotency-Key must return same response
    res2 = await client.post(
        "/api/v1/seats/2/reserve",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": idempotency_key
        }
    )
    assert res2.status_code == 200
    assert res2.headers.get("x-idempotency-hit") == "true"
    data2 = res2.json()
    assert data1["reservation_id"] == data2["reservation_id"]
