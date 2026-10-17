import random
import uuid
from locust import HttpUser, task, between

class ConcertBookingUser(HttpUser):
    wait_time = between(0.1, 0.5)

    def on_start(self):
        """Register and login each virtual user to acquire JWT authentication."""
        self.user_email = f"loadtest_{uuid.uuid4().hex[:10]}@college.edu"
        self.password = "StressTestPass123!"
        self.token = None

        # Register
        reg_resp = self.client.post("/api/v1/auth/register", json={
            "email": self.user_email,
            "password": self.password,
            "full_name": f"Load User {self.user_email[:8]}",
            "role": "student"
        }, name="/auth/register")

        # Login
        if reg_resp.status_code in [200, 201]:
            login_resp = self.client.post("/api/v1/auth/login", json={
                "email": self.user_email,
                "password": self.password
            }, name="/auth/login")
            if login_resp.status_code == 200:
                self.token = login_resp.json().get("access_token")

    @property
    def auth_headers(self):
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    @task(3)
    def view_seats(self):
        """Fetch seat layout and aggregated statuses."""
        self.client.get("/api/v1/seats", headers=self.auth_headers, name="/seats")

    @task(5)
    def attempt_booking_contested_seat(self):
        """
        Contends for high-demand seats (Seats 1 to 50 - VIP Section).
        This directly stress-tests distributed locking and concurrency guarantees.
        """
        if not self.token:
            return

        # Target high-contention seats
        target_seat_id = random.randint(1, 50)
        idempotency_key = str(uuid.uuid4())
        reserve_headers = {
            **self.auth_headers,
            "Idempotency-Key": idempotency_key
        }

        # 1. Attempt Reserve
        with self.client.post(
            f"/api/v1/seats/{target_seat_id}/reserve",
            headers=reserve_headers,
            catch_response=True,
            name="/seats/[id]/reserve"
        ) as res:
            if res.status_code == 200:
                res.success()
                data = res.json()
                res_id = data.get("reservation_id")

                # 2. Attempt Confirm
                confirm_headers = {
                    **self.auth_headers,
                    "Idempotency-Key": f"conf-{idempotency_key}"
                }
                with self.client.post(
                    f"/api/v1/seats/{target_seat_id}/confirm",
                    json={"reservation_id": res_id, "force_outcome": "success"},
                    headers=confirm_headers,
                    catch_response=True,
                    name="/seats/[id]/confirm"
                ) as conf_res:
                    if conf_res.status_code == 200:
                        conf_res.success()
                    elif conf_res.status_code in [400, 409, 410]:
                        # Expected contention response
                        conf_res.success()
                    else:
                        conf_res.failure(f"Unexpected confirm status: {conf_res.status_code}")

            elif res.status_code in [409, 429]:
                # Expected when seat is already reserved/locked by another user
                res.success()
            else:
                res.failure(f"Unexpected reserve error: {res.status_code}")

    @task(1)
    def join_waiting_queue_if_contested(self):
        """Simulate users joining queue when seats are occupied."""
        if not self.token:
            return
        self.client.post(
            "/api/v1/queue/join",
            json={"seat_id": random.randint(1, 20)},
            headers=self.auth_headers,
            name="/queue/join"
        )
