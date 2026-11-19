"""Independent personal documents; never part of canonical catalogue queries."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models import Base


class LibraryItem(Base):
    __tablename__ = "library_items"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("library_items.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, default="")
    current_hash: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    trashed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visibility: Mapped[str] = mapped_column(String(10), default="private")
    share_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    published_title: Mapped[str | None] = mapped_column(String(255))
    published_content: Mapped[str | None] = mapped_column(Text)
    published_hash: Mapped[str | None] = mapped_column(String(64))
    verified_hash: Mapped[str | None] = mapped_column(String(64))
    verified_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LibraryRevision(Base):
    __tablename__ = "library_revisions"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    item_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LibraryCanonical(Base):
    __tablename__ = "library_canonical"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    note_id: Mapped[UUID] = mapped_column(
        ForeignKey("canonical_notes.id", ondelete="CASCADE"), primary_key=True
    )
    item_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), unique=True
    )
    relocated: Mapped[bool] = mapped_column(Boolean, default=False)


class LibraryAttachment(Base):
    __tablename__ = "library_attachments"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    item_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    published: Mapped[bool] = mapped_column(Boolean, default=False)


class LibraryComment(Base):
    __tablename__ = "library_comments"
    __table_args__ = (
        CheckConstraint("(item_id IS NULL) <> (note_id IS NULL)", name="comment_one_target"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    item_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), index=True
    )
    note_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("canonical_notes.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("library_comments.id"))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LibraryWatch(Base):
    __tablename__ = "library_watches"
    item_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    seen_hash: Mapped[str] = mapped_column(String(64))
    access_token: Mapped[str | None] = mapped_column(String(64))


class LibraryFavorite(Base):
    __tablename__ = "library_favorites"
    item_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    access_token: Mapped[str | None] = mapped_column(String(64))


class LibraryGitSource(Base):
    __tablename__ = "library_git_sources"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    item_id: Mapped[UUID] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), unique=True, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    repo_url: Mapped[str] = mapped_column(String(1024))
    branch: Mapped[str] = mapped_column(String(255), default="main")
    subpath: Mapped[str | None] = mapped_column(String(512))
    last_synced_hash: Mapped[str | None] = mapped_column(String(64))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_status: Mapped[str] = mapped_column(String(32), default="synced")
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

