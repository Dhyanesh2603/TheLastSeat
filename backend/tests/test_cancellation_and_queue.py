import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.seat_repository import seat_repo
from app.core.config import settings

@pytest.mark.asyncio
async def test_cancellation_and_waiting_queue_flow(client: AsyncClient, db_session: AsyncSession):
    settings.PAYMENT_SIM_MIN_DELAY = 0.01
    settings.PAYMENT_SIM_MAX_DELAY = 0.05

    await seat_repo.seed_seats_if_empty(db_session, total_seats=5)

    # 1. Register User A (booker) and User B (waiter)
    await client.post("/api/v1/auth/register", json={
        "email": "usera@college.edu", "password": "Password123!", "full_name": "User A", "role": "student"
    })
    token_a = (await client.post("/api/v1/auth/login", json={
        "email": "usera@college.edu", "password": "Password123!"
    })).json()["access_token"]

    await client.post("/api/v1/auth/register", json={
        "email": "userb@college.edu", "password": "Password123!", "full_name": "User B", "role": "student"
    })
    token_b = (await client.post("/api/v1/auth/login", json={
        "email": "userb@college.edu", "password": "Password123!"
    })).json()["access_token"]

    # 2. User A reserves and confirms seat 3
    res_a = await client.post("/api/v1/seats/3/reserve", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200
    res_a_id = res_a.json()["reservation_id"]

    conf_a = await client.post(
        "/api/v1/seats/3/confirm",
        json={"reservation_id": res_a_id, "force_outcome": "success"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert conf_a.status_code == 200
    assert conf_a.json()["booking_status"] == "Confirmed"

    # 3. User B joins the waiting queue
    queue_join = await client.post("/api/v1/queue/join", json={"seat_id": 3}, headers={"Authorization": f"Bearer {token_b}"})
    assert queue_join.status_code == 200
    assert queue_join.json()["is_in_queue"] is True

    # 4. User A cancels their booking
    cancel_res = await client.delete("/api/v1/seats/3/cancel", headers={"Authorization": f"Bearer {token_a}"})
    assert cancel_res.status_code == 200

    # 5. Verify seat 3 is now Available
    seat_res = await client.get("/api/v1/seats/3")
    assert seat_res.json()["status"] == "Available"

    # 6. Verify User B was notified in queue
    q_status = await client.get("/api/v1/queue/status", headers={"Authorization": f"Bearer {token_b}"})
    assert q_status.status_code == 200
    assert q_status.json()["opportunity_seat_id"] == 3
