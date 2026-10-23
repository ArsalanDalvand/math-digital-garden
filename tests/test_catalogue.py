from httpx import ASGITransport, AsyncClient

from backend.app.main import app, get_catalogue_session


class Result:
    def scalars(self):
        return self

    def all(self):
        return []


class Session:
    def __init__(self):
        self.queries = []

    async def execute(self, query):
        self.queries.append(query)
        return Result()


async def test_catalogue_pagination_search_and_validation():
    session = Session()

    async def dependency():
        yield session

    app.dependency_overrides[get_catalogue_session] = dependency
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get(
                "/api/notes", params={"offset": 3, "limit": 2, "q": "کانتور%_"}
            )
            assert response.status_code == 200
            assert response.json() == []
            query = session.queries[0]
            assert "canonical_notes" in str(query) and "users" not in str(query)
            assert "ORDER BY" in str(query)
            assert 3 in query.compile().params.values()
            assert 2 in query.compile().params.values()
            assert "%کانتور\\%\\_%" in query.compile().params.values()
            for params in [{"offset": -1}, {"limit": 0}, {"limit": 101}, {"q": "x" * 201}]:
                assert (await client.get("/api/notes", params=params)).status_code == 422
            assert len(session.queries) == 1
    finally:
        app.dependency_overrides.clear()


async def test_invalid_catalogue_parameters_do_not_open_database(monkeypatch):
    from backend.app import main

    async def forbidden():
        raise AssertionError("Invalid query must not construct database session")
        yield

    monkeypatch.setattr(main, "get_session", forbidden)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/notes?limit=0")).status_code == 422


async def test_catalogue_database_errors_stay_private():
    from sqlalchemy.exc import OperationalError

    class BrokenSession:
        async def execute(self, query):
            raise OperationalError("private credentials", {}, Exception("password"))

    async def dependency():
        yield BrokenSession()

    app.dependency_overrides[get_catalogue_session] = dependency
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/notes")
            assert response.status_code == 503
            assert response.json() == {"detail": "Database unavailable"}
    finally:
        app.dependency_overrides.clear()
