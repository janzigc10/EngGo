from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_fastapi_allows_local_next_origin_for_chat_preflight(monkeypatch):
    monkeypatch.delenv("ENGGO_CORS_ALLOW_ORIGINS", raising=False)

    client = TestClient(create_app())
    response = client.options(
        "/api/chat",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    assert "POST" in response.headers["access-control-allow-methods"]
