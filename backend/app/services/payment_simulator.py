import asyncio
import logging
import random
from typing import Optional
from app.core.config import settings
from app.models.payment import PaymentStatus

logger = logging.getLogger("concert_booking.service.payment_simulator")

class PaymentSimulatorResult:
    def __init__(
        self,
        status: PaymentStatus,
        delay_seconds: float,
        failure_reason: Optional[str] = None
    ):
        self.status = status
        self.delay_seconds = delay_seconds
        self.failure_reason = failure_reason
        self.is_successful = status in [PaymentStatus.SUCCEEDED, PaymentStatus.DELAYED_SUCCESS]

class PaymentSimulatorService:
    async def process_payment(
        self,
        amount: float,
        force_outcome: Optional[str] = None,
        simulate_sleep: bool = True
    ) -> PaymentSimulatorResult:
        """
        Simulates payment gateway transaction with realistic random processing latency
        and non-deterministic outcomes (Success, Failure, Timeout, Delayed Success).
        """
        # Determine delay
        delay = round(random.uniform(settings.PAYMENT_SIM_MIN_DELAY, settings.PAYMENT_SIM_MAX_DELAY), 2)
        
        # If simulated delay is requested, sleep asynchronously
        if simulate_sleep:
            await asyncio.sleep(delay)

        # Handle forced outcomes for testing/demo
        if force_outcome:
            forced = force_outcome.lower().strip()
            if forced == "success":
                return PaymentSimulatorResult(PaymentStatus.SUCCEEDED, delay)
            elif forced == "failure":
                return PaymentSimulatorResult(
                    PaymentStatus.FAILED,
                    delay,
                    failure_reason="Card declined: Insufficient funds (Simulated)"
                )
            elif forced == "timeout":
                return PaymentSimulatorResult(
                    PaymentStatus.TIMEOUT,
                    delay,
                    failure_reason="Gateway timeout: Bank connection lost after 8s (Simulated)"
                )
            elif forced in ["delayed_success", "delayed"]:
                return PaymentSimulatorResult(PaymentStatus.DELAYED_SUCCESS, delay)

        # Standard randomized simulation distribution:
        # 70% Success
        # 15% Failure (Card declined)
        # 10% Timeout
        # 5% Delayed Success (Eventual consistency)
        roll = random.random()
        if roll < 0.70:
            return PaymentSimulatorResult(PaymentStatus.SUCCEEDED, delay)
        elif roll < 0.85:
            reasons = [
                "Card declined: Insufficient funds",
                "Card declined: Suspected fraudulent transaction",
                "Expired card",
                "Card issuer rejected transaction"
            ]
            return PaymentSimulatorResult(
                PaymentStatus.FAILED,
                delay,
                failure_reason=random.choice(reasons)
            )
        elif roll < 0.95:
            return PaymentSimulatorResult(
                PaymentStatus.TIMEOUT,
                delay,
                failure_reason="Simulated payment processor connection timeout"
            )
        else:
            return PaymentSimulatorResult(PaymentStatus.DELAYED_SUCCESS, delay)

payment_simulator = PaymentSimulatorService()
