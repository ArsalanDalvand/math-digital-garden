from collections.abc import AsyncIterator
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

from backend.app.config import settings


@lru_cache
def get_engine() -> AsyncEngine:
    if not settings.database_url:
        raise HTTPException(503, "Database unavailable")
    return create_async_engine(settings.database_url, pool_pre_ping=True)


async def get_session() -> AsyncIterator[AsyncSession]:
    try:
        async with AsyncSession(get_engine(), expire_on_commit=False) as session:
            yield session
    except (SQLAlchemyError, OSError, TimeoutError, ValueError):
        raise HTTPException(503, "Database unavailable") from None
