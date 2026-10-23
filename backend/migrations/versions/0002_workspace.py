"""Private workspace, immutable proposals, sessions and vector index."""

from typing import Any

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def uid(
    name: str, target: str | None = None, primary: bool = False, nullable: bool = False
) -> sa.Column[Any]:
    args = [sa.ForeignKey(target, ondelete="CASCADE")] if target else []
    return sa.Column(name, UUID(as_uuid=True), *args, primary_key=primary, nullable=nullable)


def txt(name: str, size: int | None = None, nullable: bool = False) -> sa.Column[Any]:
    return sa.Column(name, sa.String(size) if size else sa.Text(), nullable=nullable)


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        txt("token_hash", 64),
        uid("user_id", "users.id"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_table(
        "user_note_forks",
        uid("id", primary=True),
        uid("user_id", "users.id"),
        uid("note_id", "canonical_notes.id"),
        txt("base_hash", 64),
        txt("base_content"),
        txt("custom_content"),
        txt("current_hash", 64),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "note_id", name="uq_user_note"),
    )
    op.create_index("ix_user_note_forks_user_id", "user_note_forks", ["user_id"])
    op.create_table(
        "fork_revisions",
        uid("id", primary=True),
        uid("user_id", "users.id"),
        uid("fork_id", "user_note_forks.id"),
        txt("content"),
        txt("content_hash", 64),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_fork_revisions_user_id", "fork_revisions", ["user_id"])
    op.create_table(
        "bookmarks",
        uid("user_id", "users.id", primary=True),
        uid("note_id", "canonical_notes.id", primary=True),
    )
    op.create_table(
        "change_proposals",
        uid("id", primary=True),
        uid("user_id", "users.id"),
        uid("note_id", "canonical_notes.id"),
        txt("base_hash", 64),
        txt("base_content"),
        txt("proposed_content"),
        txt("diff_patch"),
        txt("student_comment"),
        txt("status", 50),
        txt("author_review_comment", nullable=True),
        sa.Column(
            "reviewed_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        txt("sync_status", 30),
        txt("sync_commit", 40, nullable=True),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','changes_requested')",
            name="proposal_status",
        ),
    )
    op.create_index("ix_change_proposals_user_id", "change_proposals", ["user_id"])
    op.create_table(
        "note_embeddings",
        uid("id", primary=True),
        uid("note_id", "canonical_notes.id"),
        uid("user_id", "users.id", nullable=True),
        sa.Column("is_canonical", sa.Boolean(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        txt("chunk_header", 500),
        txt("chunk_content"),
        txt("content_hash", 64),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.CheckConstraint(
            "(is_canonical AND user_id IS NULL) OR (NOT is_canonical AND user_id IS NOT NULL)",
            name="embedding_owner",
        ),
    )
    op.create_index("idx_embeddings_scope", "note_embeddings", ["is_canonical", "user_id"])


def downgrade() -> None:
    for table in [
        "note_embeddings",
        "change_proposals",
        "bookmarks",
        "fork_revisions",
        "user_note_forks",
        "auth_sessions",
    ]:
        op.drop_table(table)
