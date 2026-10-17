import asyncio
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.seat_repository import seat_repo
from app.core.config import settings

@pytest.mark.asyncio
async def test_concurrent_seat_reservation(client: AsyncClient, db_session: AsyncSession):
    # Speed up delays for test suite
    settings.PAYMENT_SIM_MIN_DELAY = 0.01
    settings.PAYMENT_SIM_MAX_DELAY = 0.05

    # 1. Seed seats
    await seat_repo.seed_seats_if_empty(db_session, total_seats=10)

    # 2. Register 10 users and map user_id -> token
    user_tokens = {}
    tokens = []
    for i in range(10):
        email = f"student_{i}@college.edu"
        reg = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": "Password123!",
            "full_name": f"Student {i}",
            "role": "student"
        })
        user_id = reg.json()["id"]

        login_res = await client.post("/api/v1/auth/login", json={
            "email": email,
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
        user_tokens[user_id] = token
        tokens.append(token)

    # 3. Simulate all 10 users concurrently attempting to reserve seat ID 1
    target_seat_id = 1

    async def attempt_reserve(token: str):
        return await client.post(
            f"/api/v1/seats/{target_seat_id}/reserve",
            headers={"Authorization": f"Bearer {token}"}
        )

    tasks = [attempt_reserve(t) for t in tokens]
    responses = await asyncio.gather(*tasks)

    # 4. Strict assertions:
    # Exactly ONE response should be 200 OK.
    # Exactly N-1 responses should be 409 Conflict.
    successes = [r for r in responses if r.status_code == 200]
    conflicts = [r for r in responses if r.status_code == 409]

    assert len(successes) == 1, f"Expected exactly 1 successful reservation, got {len(successes)}"
    assert len(conflicts) == 9, f"Expected 9 conflicts, got {len(conflicts)}"

    # 5. Confirm the winner's booking
    winner_res = successes[0].json()
    winner_res_id = winner_res["reservation_id"]
    winner_user_id = winner_res["user_id"]
    winner_token = user_tokens[winner_user_id]

    confirm_res = await client.post(
        f"/api/v1/seats/{target_seat_id}/confirm",
        json={"reservation_id": winner_res_id, "force_outcome": "success"},
        headers={"Authorization": f"Bearer {winner_token}"}
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["booking_status"] == "Confirmed"

    # 6. Verify second attempt to confirm or reserve is rejected
    non_winner_token = [t for u, t in user_tokens.items() if u != winner_user_id][0]
    second_reserve = await client.post(
        f"/api/v1/seats/{target_seat_id}/reserve",
        headers={"Authorization": f"Bearer {non_winner_token}"}
    )
    assert second_reserve.status_code == 409
