"""
database.py - db connection setup with SQLAlchemy async

using asyncpg as the driver since FastAPI is async anyway
"""

import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# get from env or fall back to local dev defaults
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://flightbrief:flightbrief@localhost:5432/flightbrief"
)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    DATABASE_URL,
    echo=False,  # set to True for debugging sql queries
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    """dependency injection for FastAPI routes"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """run schema.sql on startup if tables don't exist"""
    import asyncpg
    # parse the database URL to get connection params
    # bit hacky but works for now
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    schema_path = os.path.join(os.path.dirname(__file__), "..", "db", "schema.sql")

    try:
        conn = await asyncpg.connect(DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"))
        with open(schema_path) as f:
            schema = f.read()
        await conn.execute(schema)
        await conn.close()
        print("[db] schema initialized")
    except Exception as e:
        print(f"[db] could not run schema: {e}")
        # not fatal - tables might already exist
