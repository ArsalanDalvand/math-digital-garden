"""Independent personal document collection; no canonical data migration."""

import sqlalchemy as sa
from alembic import op

from backend.app.library_models import (
    LibraryAttachment,
    LibraryComment,
    LibraryItem,
    LibraryRevision,
    LibraryWatch,
)

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None
TABLES = (LibraryItem, LibraryRevision, LibraryAttachment, LibraryComment, LibraryWatch)


def upgrade():
    for model in TABLES:
        if model is LibraryComment:
            # Freeze the original schema; later model columns belong to later migrations.
            op.create_table(
                "library_comments",
                sa.Column("id", sa.Uuid(), primary_key=True),
                sa.Column(
                    "item_id",
                    sa.Uuid(),
                    sa.ForeignKey("library_items.id", ondelete="CASCADE"),
                    nullable=False,
                ),
                sa.Column(
                    "user_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id", ondelete="CASCADE"),
                    nullable=False,
                ),
                sa.Column("parent_id", sa.Uuid(), sa.ForeignKey("library_comments.id")),
                sa.Column("resolved", sa.Boolean(), nullable=False),
                sa.Column("content", sa.Text(), nullable=False),
                sa.Column(
                    "created_at",
                    sa.DateTime(timezone=True),
                    server_default=sa.func.now(),
                    nullable=False,
                ),
            )
            op.create_index("ix_library_comments_item_id", "library_comments", ["item_id"])
        elif model is LibraryAttachment:
            # Freeze the original schema; later storage columns belong to migration 0012.
            op.create_table(
                "library_attachments",
                sa.Column("id", sa.Uuid(), primary_key=True),
                sa.Column(
                    "item_id",
                    sa.Uuid(),
                    sa.ForeignKey("library_items.id", ondelete="CASCADE"),
                    nullable=False,
                ),
                sa.Column(
                    "user_id",
                    sa.Uuid(),
                    sa.ForeignKey("users.id", ondelete="CASCADE"),
                    nullable=False,
                ),
                sa.Column("filename", sa.String(255), nullable=False),
                sa.Column("data", sa.LargeBinary(), nullable=False),
                sa.Column("published", sa.Boolean(), nullable=False),
            )
            op.create_index(
                "ix_library_attachments_item_id", "library_attachments", ["item_id"]
            )
            op.create_index(
                "ix_library_attachments_user_id", "library_attachments", ["user_id"]
            )
        else:
            model.__table__.create(op.get_bind())


def downgrade():
    for model in reversed(TABLES):
        model.__table__.drop(op.get_bind())
