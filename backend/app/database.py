import json
from collections.abc import AsyncIterator
from functools import lru_cache, partial

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.app.config import settings


@lru_cache
def get_engine() -> AsyncEngine:
    if not settings.database_url:
        raise HTTPException(503, "Database unavailable")
    return create_async_engine(
        settings.database_url,
        pool_size=10,
        max_overflow=15,
        pool_recycle=1800,
        pool_pre_ping=True,
        json_serializer=partial(json.dumps, ensure_ascii=False),
    )


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    try:
        async with get_session_factory()() as session:
            yield session
    except (SQLAlchemyError, OSError, TimeoutError, ValueError):
        raise HTTPException(503, "Database unavailable") from None
