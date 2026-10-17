import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.models.base import Base
import app.models
from app.core import database, redis_client
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.main import app
import fakeredis.aioredis
import fakeredis

# Test SQLite in-memory shared database
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)

TestAsyncSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Patch database AsyncSessionLocal for tests
database.AsyncSessionLocal = TestAsyncSessionLocal

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with TestAsyncSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture(scope="function")
async def fake_redis():
    # Use FakeServer with Lua scripting enabled via lupa
    server = fakeredis.FakeServer(version=(7, 0, 0))
    client = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)
    redis_client._redis_client = client
    yield client
    await client.flushall()
    await client.aclose()

@pytest_asyncio.fixture(scope="function")
async def client(db_session, fake_redis):
    async def override_get_db():
        yield db_session

    async def override_get_redis():
        return fake_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()
