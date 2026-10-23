"""Shared canonical threads; existing personal comments keep their target."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("library_comments", sa.Column("note_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "library_comments_note_id_fkey",
        "library_comments",
        "canonical_notes",
        ["note_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_library_comments_note_id", "library_comments", ["note_id"])
    op.alter_column("library_comments", "item_id", nullable=True)
    op.create_check_constraint(
        "comment_one_target", "library_comments", "(item_id IS NULL) <> (note_id IS NULL)"
    )


def downgrade():
    raise RuntimeError("Canonical comments require preservation; automatic downgrade is disabled")
