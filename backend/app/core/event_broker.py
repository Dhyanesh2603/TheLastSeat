import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Callable, List, Optional
from app.core.config import settings

logger = logging.getLogger("concert_booking.event_broker")

class EventBroker:
    """
    Asynchronous Message Broker & Event Bus.
    Supports:
    1. Native AMQP RabbitMQ (via aio-pika)
    2. Redis Pub/Sub / Streams (via Redis connection)
    3. In-memory asynchronous event loop dispatcher for local / standalone operation
    """
    def __init__(self):
        self._handlers: Dict[str, List[Callable[[Dict[str, Any]], Any]]] = {}
        self._rabbitmq_connection = None
        self._rabbitmq_channel = None
        self._rabbitmq_exchange = None
        self._redis_client = None
        self._is_connected = False
        self._broker_type = "in_memory"

    async def initialize(self, redis_client=None):
        self._redis_client = redis_client
        
        # 1. Attempt RabbitMQ if configured
        if settings.RABBITMQ_URL:
            try:
                import aio_pika
                self._rabbitmq_connection = await aio_pika.connect_robust(
                    settings.RABBITMQ_URL,
                    timeout=5.0
                )
                self._rabbitmq_channel = await self._rabbitmq_connection.channel()
                self._rabbitmq_exchange = await self._rabbitmq_channel.declare_exchange(
                    "concert_events",
                    aio_pika.ExchangeType.TOPIC,
                    durable=True
                )
                self._broker_type = "rabbitmq"
                self._is_connected = True
                logger.info(f"Connected to RabbitMQ at {settings.RABBITMQ_URL}")
                return
            except Exception as e:
                logger.warning(f"RabbitMQ connection not available ({e}). Falling back to Redis/In-Memory.")

        # 2. Redis Pub/Sub if available
        if self._redis_client:
            self._broker_type = "redis_pubsub"
            self._is_connected = True
            logger.info("EventBroker utilizing Redis Pub/Sub for asynchronous messaging.")
            return

        # 3. Fallback to in-memory async event dispatcher
        self._broker_type = "in_memory"
        self._is_connected = True
        logger.info("EventBroker initialized in in-memory asynchronous mode.")

    @property
    def broker_type(self) -> str:
        return self._broker_type

    def register_handler(self, event_name: str, handler: Callable[[Dict[str, Any]], Any]):
        """Register an async or sync handler for a domain event topic."""
        if event_name not in self._handlers:
            self._handlers[event_name] = []
        self._handlers[event_name].append(handler)

    async def publish(self, event_name: str, payload: Dict[str, Any]):
        """
        Publishes a domain event asynchronously to the configured broker.
        Guarantees non-blocking execution so HTTP transactions complete with minimal latency.
        """
        envelope = {
            "event": event_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload
        }
        raw_message = json.dumps(envelope, default=str)

        # 1. RabbitMQ dispatch
        if self._broker_type == "rabbitmq" and self._rabbitmq_exchange:
            try:
                import aio_pika
                message = aio_pika.Message(
                    body=raw_message.encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    content_type="application/json"
                )
                await self._rabbitmq_exchange.publish(message, routing_key=event_name)
            except Exception as e:
                logger.error(f"Failed to publish to RabbitMQ: {e}")

        # 2. Redis Pub/Sub dispatch
        elif self._broker_type == "redis_pubsub" and self._redis_client:
            try:
                channel = f"events:{event_name}"
                await self._redis_client.publish(channel, raw_message)
            except Exception as e:
                logger.error(f"Failed to publish to Redis Pub/Sub: {e}")

        # 3. In-process subscribers (always notified)
        handlers = self._handlers.get(event_name, []) + self._handlers.get("*", [])
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    asyncio.create_task(handler(envelope))
                else:
                    handler(envelope)
            except Exception as handler_err:
                logger.error(f"Error executing event handler for '{event_name}': {handler_err}")

    async def close(self):
        if self._rabbitmq_connection:
            try:
                await self._rabbitmq_connection.close()
            except Exception:
                pass

event_broker = EventBroker()
