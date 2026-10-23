"""Site-owned Dify conversation IDs; no note or vector changes."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("upstream_id", sa.String(128)),
    )
    op.create_index("ix_ai_conversations_user_id", "ai_conversations", ["user_id"])


def downgrade() -> None:
    op.drop_table("ai_conversations")
