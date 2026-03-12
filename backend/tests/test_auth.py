"""Tests for the auth module — JWT extraction and validation helpers."""

import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException


class TestGetCurrentUser:
    @pytest.mark.asyncio
    async def test_missing_auth_header(self):
        from app.auth import get_current_user
        request = MagicMock()
        request.headers.get.return_value = ""

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)
        assert exc_info.value.status_code == 401
        assert "Missing" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_malformed_bearer_prefix(self):
        from app.auth import get_current_user
        request = MagicMock()
        request.headers.get.return_value = "Token abc123"

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_generic_error_messages(self):
        """Auth errors should never leak implementation details."""
        from app.auth import get_current_user
        request = MagicMock()
        request.headers.get.return_value = "Bearer fake.jwt.token"

        with patch("app.auth._fetch_jwks", return_value={"keys": []}), \
             patch("app.auth.get_settings") as mock_settings:
            mock_settings.return_value.supabase_url = "https://test.supabase.co"
            mock_settings.return_value.supabase_jwt_secret = "test-secret"

            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(request)
            # Should NOT contain technical details like "signature", "algorithm", etc.
            assert "Authentication failed" in exc_info.value.detail
