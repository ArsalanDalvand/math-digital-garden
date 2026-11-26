"""Move LibraryAttachment storage from PostgreSQL BYTEA to disk volume."""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "library_attachments",
        sa.Column("storage_key", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "library_attachments",
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "library_attachments",
        sa.Column("sha256", sa.String(length=64), nullable=True),
    )
    op.execute(
        "UPDATE library_attachments "
        "SET size_bytes = octet_length(data) "
        "WHERE data IS NOT NULL AND size_bytes = 0"
    )
    op.alter_column(
        "library_attachments",
        "data",
        existing_type=sa.LargeBinary(),
        nullable=True,
    )


def downgrade():
    op.execute("DELETE FROM library_attachments WHERE data IS NULL")
    op.alter_column(
        "library_attachments",
        "data",
        existing_type=sa.LargeBinary(),
        nullable=False,
    )
    op.drop_column("library_attachments", "sha256")
    op.drop_column("library_attachments", "size_bytes")
    op.drop_column("library_attachments", "storage_key")
