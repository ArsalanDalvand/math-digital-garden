import asyncio
from hashlib import sha256
from pathlib import Path

from sqlalchemy.dialects.postgresql import Insert, insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_engine
from backend.app.models import CanonicalNote


def sample_note_statement() -> Insert:
    raw = (Path(__file__).resolve().parents[2] / "tests/fixtures/cantor.md").read_bytes()
    return (
        insert(CanonicalNote)
        .values(
            slug="cantor",
            title="قضیهٔ کانتور",
            book_slug="math",
            chapter_slug="sets",
            relative_path="math/sets/cantor.md",
            current_content=raw.decode("utf-8"),
            current_hash=sha256(raw).hexdigest(),
        )
        .on_conflict_do_nothing(index_elements=["slug"])
    )


def related_note_statements() -> list[Insert]:
    statements = []
    for slug, title in [("sets", "مجموعه‌ها"), ("cardinality", "اندازهٔ مجموعه")]:
        raw = (Path(__file__).resolve().parents[2] / f"tests/fixtures/{slug}.md").read_bytes()
        statements.append(
            insert(CanonicalNote)
            .values(
                slug=slug,
                title=title,
                book_slug="math",
                chapter_slug="sets",
                relative_path=f"math/sets/{slug}.md",
                current_content=raw.decode("utf-8"),
                current_hash=sha256(raw).hexdigest(),
            )
            .on_conflict_do_nothing(index_elements=["slug"])
        )
    return statements


async def main() -> None:
    engine = get_engine()
    try:
        async with AsyncSession(engine) as session:
            for statement in [sample_note_statement(), *related_note_statements()]:
                await session.execute(statement)
            await session.commit()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
