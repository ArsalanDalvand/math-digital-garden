"""Change proposals and author review boundary routes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from diff_match_patch import diff_match_patch  # type: ignore[import-untyped]
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select

from backend.app.config import settings
from backend.app.models import CanonicalNote, ChangeProposal
from backend.app.note_indexing import build_note_lookup, sync_note_index
from backend.app.workspace.security import (
    DB,
    Author,
    Contract,
    Me,
    digest,
    invalidate_vectors,
    note_by_slug,
    owned_fork,
    schedule_index,
    sync_approved,
    write_guard,
)

router = APIRouter()


class ProposalInput(Contract):
    slug: str = Field(min_length=1, max_length=255)
    comment: str = Field(min_length=1, max_length=4000)


class ReviewInput(Contract):
    decision: Literal["approve", "reject", "changes_requested"]
    comment: str = Field(default="", max_length=4000)


def proposal_json(p: ChangeProposal, slug: str = "") -> dict[str, object]:
    return {
        **{
            k: getattr(p, k)
            for k in (
                "id",
                "note_id",
                "base_hash",
                "base_content",
                "proposed_content",
                "diff_patch",
                "student_comment",
                "status",
                "author_review_comment",
                "created_at",
                "reviewed_at",
                "sync_status",
                "sync_commit",
            )
        },
        "slug": slug,
    }


@router.post("/proposals", status_code=201, dependencies=[Depends(write_guard)])
async def propose(data: ProposalInput, user: Me, db: DB) -> dict[str, object]:
    note = await note_by_slug(db, data.slug)
    fork = await owned_fork(db, note.id, user.id, lock=True)
    if fork is None or fork.custom_content == fork.base_content:
        raise HTTPException(409, "No personal changes to propose")
    dmp = diff_match_patch()
    item = ChangeProposal(
        user_id=user.id,
        note_id=note.id,
        base_hash=fork.base_hash,
        base_content=fork.base_content,
        proposed_content=fork.custom_content,
        diff_patch=dmp.patch_toText(dmp.patch_make(fork.base_content, fork.custom_content)),
        student_comment=data.comment,
    )
    db.add(item)
    await db.commit()
    return proposal_json(item, note.slug)


@router.get("/proposals")
async def proposals(user: Me, db: DB) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .where(ChangeProposal.user_id == user.id)
            .order_by(ChangeProposal.created_at.desc())
            .limit(100)
        )
    ).all()
    return [proposal_json(p, slug) for p, slug in rows]


@router.get("/proposals/{proposal_id}")
async def proposal(proposal_id: UUID, user: Me, db: DB) -> dict[str, object]:
    row = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .where(ChangeProposal.id == proposal_id, ChangeProposal.user_id == user.id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Proposal not found")
    return proposal_json(*row)


# Explicit author review boundary: students always use the owner-scoped endpoints above.
@router.get("/review")
async def review_list(user: Author, db: DB) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .order_by(ChangeProposal.created_at.desc())
            .limit(100)
        )
    ).all()
    return [proposal_json(p, slug) for p, slug in rows]


@router.get("/review/{proposal_id}")
async def review_detail(proposal_id: UUID, user: Author, db: DB) -> dict[str, object]:
    row = (
        await db.execute(
            select(ChangeProposal, CanonicalNote.slug)
            .join(CanonicalNote)
            .where(ChangeProposal.id == proposal_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(404, "Proposal not found")
    return proposal_json(*row)


@router.post("/review/{proposal_id}", dependencies=[Depends(write_guard)])
async def decide(
    proposal_id: UUID, data: ReviewInput, user: Author, db: DB, tasks: BackgroundTasks
) -> dict[str, object]:
    # Discover note ID without a proposal lock, then acquire canonical before proposal/fork locks.
    note_id = await db.scalar(
        select(ChangeProposal.note_id).where(ChangeProposal.id == proposal_id)
    )
    if note_id is None:
        raise HTTPException(404, "Proposal not found")
    note = await db.scalar(
        select(CanonicalNote).where(CanonicalNote.id == note_id).with_for_update()
    )
    p = await db.scalar(
        select(ChangeProposal).where(ChangeProposal.id == proposal_id).with_for_update()
    )
    assert note is not None and p is not None
    if p.status != "pending":
        raise HTTPException(409, "Proposal already reviewed")
    if data.decision == "approve":
        if note.current_hash != p.base_hash or digest(p.base_content) != p.base_hash:
            raise HTTPException(409, "Canonical base changed; request a new proposal")
        dmp = diff_match_patch()
        merged, results = dmp.patch_apply(dmp.patch_fromText(p.diff_patch), note.current_content)
        if not all(results) or merged != p.proposed_content:
            raise HTTPException(409, "Patch does not apply exactly")
        note.current_content, note.current_hash = merged, digest(merged)
        note.updated_at = datetime.now(UTC)
        await invalidate_vectors(db, note.id, None)
        all_notes = (
            await db.execute(
                select(
                    CanonicalNote.id,
                    CanonicalNote.slug,
                    CanonicalNote.title,
                    CanonicalNote.relative_path,
                    CanonicalNote.frontmatter,
                )
            )
        ).all()
        resolve_slug = build_note_lookup(all_notes)
        slug_to_id = {row.slug: row.id for row in all_notes}
        await sync_note_index(db, note, resolve_slug, slug_to_id)
    p.status = {
        "approve": "approved",
        "reject": "rejected",
        "changes_requested": "changes_requested",
    }[data.decision]
    p.author_review_comment, p.reviewed_by = data.comment, user.id
    p.reviewed_at = datetime.now(UTC)
    await db.commit()
    if p.status == "approved":
        schedule_index(tasks, note.id, None)
    if p.status == "approved" and settings.content_git_repo:
        await sync_approved(db, p, note)
    return proposal_json(p, note.slug)


@router.post("/review/{proposal_id}/sync", dependencies=[Depends(write_guard)])
async def retry_sync(proposal_id: UUID, user: Author, db: DB) -> dict[str, object]:
    p = await db.scalar(
        select(ChangeProposal).where(ChangeProposal.id == proposal_id).with_for_update()
    )
    if p is None:
        raise HTTPException(404, "Proposal not found")
    if p.status != "approved":
        raise HTTPException(409, "Only approved proposals can be exported")
    note = await db.scalar(select(CanonicalNote).where(CanonicalNote.id == p.note_id))
    assert note is not None
    await sync_approved(db, p, note)
    return proposal_json(p, note.slug)
