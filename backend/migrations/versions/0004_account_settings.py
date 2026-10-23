"""Persist self-owned account avatar and preferences; preserve existing users."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_png", sa.LargeBinary(), nullable=True))
    op.add_column("users", sa.Column("preferences_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferences_json")
    op.drop_column("users", "avatar_png")
