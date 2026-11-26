"""Add flexible frontmatter JSONB, tsvector search, render cache, and note_edges."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "canonical_notes",
        sa.Column(
            "frontmatter",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column("canonical_notes", sa.Column("search_vector", TSVECTOR, nullable=True))
    op.add_column("canonical_notes", sa.Column("rendered_html", sa.Text(), nullable=True))
    op.add_column(
        "canonical_notes",
        sa.Column(
            "render_meta",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "canonical_notes",
        sa.Column("render_version", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "note_edges",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "source_note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("canonical_notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("canonical_notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("relation_type", sa.Text(), nullable=False),
        sa.Column("edge_source", sa.Text(), nullable=False, server_default="wikilink"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "source_note_id",
            "target_note_id",
            "relation_type",
            "edge_source",
            name="uq_note_edges_quad",
        ),
    )
    op.create_index("idx_note_edges_source", "note_edges", ["source_note_id", "relation_type"])
    op.create_index("idx_note_edges_target", "note_edges", ["target_note_id", "relation_type"])
    op.create_index("idx_note_edges_relation", "note_edges", ["relation_type"])

    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_canonical_notes_frontmatter_gin "
            "ON canonical_notes USING gin (frontmatter jsonb_path_ops);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_canonical_notes_search_vector_gin "
            "ON canonical_notes USING gin (search_vector);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_canonical_notes_content_trgm "
            "ON canonical_notes USING gin (current_content gin_trgm_ops);"
        )


def downgrade():
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_canonical_notes_content_trgm;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_canonical_notes_search_vector_gin;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_canonical_notes_frontmatter_gin;")

    op.drop_index("idx_note_edges_relation", table_name="note_edges")
    op.drop_index("idx_note_edges_target", table_name="note_edges")
    op.drop_index("idx_note_edges_source", table_name="note_edges")
    op.drop_table("note_edges")

    op.drop_column("canonical_notes", "render_version")
    op.drop_column("canonical_notes", "render_meta")
    op.drop_column("canonical_notes", "rendered_html")
    op.drop_column("canonical_notes", "search_vector")
    op.drop_column("canonical_notes", "frontmatter")
