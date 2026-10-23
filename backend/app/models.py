from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('student', 'author', 'admin')", name="valid_user_role"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(255))
    avatar_png: Mapped[bytes | None] = mapped_column()
    preferences_json: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(50), server_default="student")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CanonicalNote(Base):
    __tablename__ = "canonical_notes"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    slug: Mapped[str] = mapped_column(String(255), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    book_slug: Mapped[str] = mapped_column(String(100))
    chapter_slug: Mapped[str] = mapped_column(String(100))
    relative_path: Mapped[str] = mapped_column(String(500))
    current_content: Mapped[str] = mapped_column(Text)
    current_hash: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class UserNoteFork(Base):
    __tablename__ = "user_note_forks"
    __table_args__ = (UniqueConstraint("user_id", "note_id", name="uq_user_note"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    note_id: Mapped[UUID] = mapped_column(ForeignKey("canonical_notes.id", ondelete="CASCADE"))
    base_hash: Mapped[str] = mapped_column(String(64))
    base_content: Mapped[str] = mapped_column(Text)
    custom_content: Mapped[str] = mapped_column(Text)
    current_hash: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ForkRevision(Base):
    __tablename__ = "fork_revisions"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    fork_id: Mapped[UUID] = mapped_column(ForeignKey("user_note_forks.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Bookmark(Base):
    __tablename__ = "bookmarks"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    note_id: Mapped[UUID] = mapped_column(
        ForeignKey("canonical_notes.id", ondelete="CASCADE"), primary_key=True
    )


class ChangeProposal(Base):
    __tablename__ = "change_proposals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected','changes_requested')",
            name="proposal_status",
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    note_id: Mapped[UUID] = mapped_column(ForeignKey("canonical_notes.id", ondelete="CASCADE"))
    base_hash: Mapped[str] = mapped_column(String(64))
    base_content: Mapped[str] = mapped_column(Text)
    proposed_content: Mapped[str] = mapped_column(Text)
    diff_patch: Mapped[str] = mapped_column(Text)
    student_comment: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    author_review_comment: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_status: Mapped[str] = mapped_column(String(30), default="pending")
    sync_commit: Mapped[str | None] = mapped_column(String(40))


class NoteEmbedding(Base):
    __tablename__ = "note_embeddings"
    __table_args__ = (
        CheckConstraint(
            "(is_canonical AND user_id IS NULL) OR (NOT is_canonical AND user_id IS NOT NULL)",
            name="embedding_owner",
        ),
        Index("idx_embeddings_scope", "is_canonical", "user_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    note_id: Mapped[UUID] = mapped_column(ForeignKey("canonical_notes.id", ondelete="CASCADE"))
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    is_canonical: Mapped[bool] = mapped_column(Boolean)
    chunk_index: Mapped[int] = mapped_column(Integer)
    chunk_header: Mapped[str] = mapped_column(String(500))
    chunk_content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float]] = mapped_column(Vector(1536))


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    upstream_id: Mapped[str | None] = mapped_column(String(128))
