"""Authenticated workspace and the author review boundary."""

from __future__ import annotations

from fastapi import APIRouter

from backend.app.workspace.auth import (
    Credentials,
    Registration,
    issue_session,
)
from backend.app.workspace.auth import router as auth_router
from backend.app.workspace.forks import (
    RebaseInput,
    ResetFork,
    SaveFork,
)
from backend.app.workspace.forks import router as forks_router
from backend.app.workspace.proposals import (
    ProposalInput,
    ReviewInput,
    proposal_json,
)
from backend.app.workspace.proposals import router as proposals_router
from backend.app.workspace.security import (
    DB,
    DUMMY_HASH,
    Author,
    Contract,
    Me,
    Writes,
    author_user,
    current_user,
    digest,
    fork_json,
    invalidate_vectors,
    limiter,
    note_by_slug,
    owned_fork,
    passwords,
    persist_fork,
    schedule_index,
    sync_approved,
    user_json,
    write_guard,
)

router = APIRouter(prefix="/api")
router.include_router(auth_router)
router.include_router(forks_router)
router.include_router(proposals_router)

__all__ = [
    "Author",
    "Contract",
    "Credentials",
    "DB",
    "DUMMY_HASH",
    "Me",
    "ProposalInput",
    "RebaseInput",
    "Registration",
    "ResetFork",
    "ReviewInput",
    "SaveFork",
    "Writes",
    "author_user",
    "current_user",
    "digest",
    "fork_json",
    "invalidate_vectors",
    "issue_session",
    "limiter",
    "note_by_slug",
    "owned_fork",
    "passwords",
    "persist_fork",
    "proposal_json",
    "router",
    "schedule_index",
    "sync_approved",
    "user_json",
    "write_guard",
]
