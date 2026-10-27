from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_docker_startup_uses_platform_port_without_running_migrations():
    dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert "${PORT:-8000}" in dockerfile
    assert "--port" in dockerfile
    assert "alembic upgrade head" not in dockerfile


def test_production_frontend_requires_explicit_api_url():
    api_client = (ROOT / "frontend" / "src" / "services" / "api.js").read_text(encoding="utf-8")

    assert 'import.meta.env.DEV ? "http://localhost:8000/api/v1" : ""' in api_client
    assert "VITE_API_URL must be configured for production builds." in api_client