"""Regression tests for JWT secret configuration and tenant guard helpers."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core import security
from app.db.session import Settings


def test_settings_require_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url="sqlite://")


def test_settings_reject_short_secret_key():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url="sqlite://", secret_key="short")


def test_settings_reject_documented_placeholder():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            database_url="sqlite://",
            secret_key="change-me-to-a-long-random-string",
        )


def test_settings_accept_long_secret_key():
    settings = Settings(
        _env_file=None,
        database_url="sqlite://",
        secret_key="x" * 32,
    )
    assert settings.secret_key.get_secret_value() == "x" * 32


def test_cors_origins_default_to_none():
    settings = Settings(
        _env_file=None,
        database_url="sqlite://",
        secret_key="x" * 32,
    )
    assert settings.cors_origins == ""


def test_security_module_has_no_hardcoded_secret():
    assert not hasattr(security, "SECRET_KEY")


def test_require_org_scoped_rejects_missing_organization():
    user = SimpleNamespace(organization_id=None)
    with pytest.raises(HTTPException) as exc:
        security.require_org_scoped("org-1", user)
    assert exc.value.status_code == 403


def test_require_org_scoped_rejects_empty_organization():
    user = SimpleNamespace(organization_id="")
    with pytest.raises(HTTPException) as exc:
        security.require_org_scoped("org-1", user)
    assert exc.value.status_code == 403


def test_require_org_scoped_rejects_cross_organization():
    user = SimpleNamespace(organization_id="org-1")
    with pytest.raises(HTTPException) as exc:
        security.require_org_scoped("org-2", user)
    assert exc.value.status_code == 403


def test_require_org_scoped_allows_same_organization():
    user = SimpleNamespace(organization_id="org-1")
    security.require_org_scoped("org-1", user)
