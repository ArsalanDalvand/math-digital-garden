"""User-owned favorites, independent of document ownership."""

from alembic import op

from backend.app.library_models import LibraryFavorite

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    LibraryFavorite.__table__.create(op.get_bind())


def downgrade():
    LibraryFavorite.__table__.drop(op.get_bind())
