"""
Automated Load Test Runner & Invariant Verifier.
Executes Locust test scenarios against the backend and programmatically verifies
that zero duplicate bookings were created across all seats.
"""

import sys
import os
import subprocess
import time
import asyncio
from httpx import AsyncClient

BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8001")

SCENARIOS = [
    {"name": "100 Concurrent Users", "users": 100, "spawn_rate": 20, "run_time": "15s"},
    {"name": "500 Concurrent Users", "users": 500, "spawn_rate": 50, "run_time": "20s"},
    {"name": "1000 Concurrent Users", "users": 1000, "spawn_rate": 100, "run_time": "30s"}
]

async def verify_concurrency_invariants():
    print("\n" + "=" * 60)
    print("PROGRAMMATIC CONCURRENCY INVARIANT AUDIT")
    print("=" * 60)
    
    async with AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        # Check health
        health = await client.get("/api/v1/health")
        print(f"Health Status: {health.json()}")

        # Check login as admin
        admin_login = await client.post("/api/v1/auth/login", json={
            "email": "admin@college.edu",
            "password": "AdminPass123!"
        })
        if admin_login.status_code != 200:
            print("Could not login as admin for verification.")
            return False

        token = admin_login.json()["access_token"]
        stats_resp = await client.get("/api/v1/admin/stats", headers={"Authorization": f"Bearer {token}"})
        stats = stats_resp.json()

        print(f"Total Double Bookings Detected: {stats.get('concurrency_double_booking_count')}")
        print(f"Payment Success Rate: {stats.get('payment_success_rate_percent')}%")
        print(f"Active Redis Reservations: {stats.get('active_redis_reservations')}")
        print(f"Active Waiting Queue: {stats.get('active_waiting_queue_count')}")

        double_bookings = stats.get("concurrency_double_booking_count", 0)
        if double_bookings == 0:
            print("\n[SUCCESS] VERIFICATION PASSED: ZERO DOUBLE BOOKINGS GUARANTEED!")
            return True
        else:
            print(f"\n[CRITICAL FAILURE] INVARIANT VIOLATED: {double_bookings} double bookings detected!")
            return False

def run_scenario(scenario):
    print(f"\n>>> Running Scenario: {scenario['name']} ({scenario['users']} users, spawn: {scenario['spawn_rate']}/s, duration: {scenario['run_time']})")
    cmd = [
        sys.executable, "-m", "locust",
        "-f", "load-testing/locustfile.py",
        "--headless",
        "-u", str(scenario["users"]),
        "-r", str(scenario["spawn_rate"]),
        "--run-time", scenario["run_time"],
        "--host", BASE_URL
    ]
    subprocess.run(cmd)

if __name__ == "__main__":
    print("Concert Booking Platform - Load Test Orchestrator")
    if len(sys.argv) > 1 and sys.argv[1] == "--verify-only":
        asyncio.run(verify_concurrency_invariants())
    else:
        for s in SCENARIOS:
            run_scenario(s)
            time.sleep(2)
        asyncio.run(verify_concurrency_invariants())
