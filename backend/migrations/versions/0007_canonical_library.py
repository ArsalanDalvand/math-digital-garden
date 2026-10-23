"""Owner-scoped library actions for canonical notes; existing rows are unchanged."""

from alembic import op

from backend.app.library_models import LibraryCanonical

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    LibraryCanonical.__table__.create(op.get_bind())


def downgrade():
    LibraryCanonical.__table__.drop(op.get_bind())
