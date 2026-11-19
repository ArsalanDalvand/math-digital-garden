"""Performance indexes: HNSW vector search, trigram search, composite active library items."""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Trigram extension and search index
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_canonical_notes_title_trgm ON canonical_notes USING gin (title gin_trgm_ops);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_canonical_notes_book_chapter ON canonical_notes (book_slug, chapter_slug);")

    # 2. Vector index for AI RAG embeddings
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_note_embeddings_hnsw ON note_embeddings 
        USING hnsw (embedding vector_cosine_ops) 
        WITH (m = 16, ef_construction = 64);
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_note_embeddings_note_id ON note_embeddings (note_id);")

    # 3. Composite index for active library items
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_library_items_user_parent_active 
        ON library_items (user_id, parent_id, title) 
        WHERE trashed_at IS NULL;
    """)

    # 4. Foreign key helper indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_note_forks_note_id ON user_note_forks (note_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_fork_revisions_fork_id ON fork_revisions (fork_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_change_proposals_note_id ON change_proposals (note_id);")


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_change_proposals_note_id;")
    op.execute("DROP INDEX IF EXISTS idx_fork_revisions_fork_id;")
    op.execute("DROP INDEX IF EXISTS idx_user_note_forks_note_id;")
    op.execute("DROP INDEX IF EXISTS idx_library_items_user_parent_active;")
    op.execute("DROP INDEX IF EXISTS idx_note_embeddings_note_id;")
    op.execute("DROP INDEX IF EXISTS idx_note_embeddings_hnsw;")
    op.execute("DROP INDEX IF EXISTS idx_canonical_notes_book_chapter;")
    op.execute("DROP INDEX IF EXISTS idx_canonical_notes_title_trgm;")
