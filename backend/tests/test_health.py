from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_health_returns_service_status():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "enggo-fastapi",
    }
