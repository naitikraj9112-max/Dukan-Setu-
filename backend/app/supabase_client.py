from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from .config import Settings
from .errors import SupabaseError


class SupabaseREST:
    """RLS-preserving Supabase REST wrapper; requests always use the caller JWT."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))
        self._owns_client = client is None

    async def close(self) -> None:
        if self._owns_client:
            await self.client.aclose()

    def _headers(self, token: str | None = None, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.settings.supabase_anon_key,
            "Authorization": f"Bearer {token or self.settings.supabase_anon_key}",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        params: dict[str, str] | None = None,
        body: Any = None,
        prefer: str | None = None,
    ) -> Any:
        try:
            response = await self.client.request(
                method,
                f"{self.settings.supabase_url}{path}",
                headers=self._headers(token, prefer),
                params=params,
                json=body,
            )
        except httpx.TimeoutException as exc:
            raise SupabaseError(504, "timeout") from exc
        except httpx.RequestError as exc:
            raise SupabaseError(502, "unavailable") from exc
        if response.is_error:
            try:
                detail = response.json()
            except ValueError:
                detail = {}
            if not isinstance(detail, dict):
                detail = {}
            raise SupabaseError(
                response.status_code,
                str(detail.get("code", "supabase_error")),
                str(detail.get("message", "")),
            )
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def get_user(self, token: str) -> dict[str, Any]:
        result = await self.request("GET", "/auth/v1/user", token=token)
        if not isinstance(result, dict):
            raise SupabaseError(401, "invalid_user")
        return result

    async def rows(
        self,
        table: str,
        token: str,
        params: dict[str, str],
    ) -> list[dict[str, Any]]:
        result = await self.request("GET", f"/rest/v1/{table}", token=token, params=params)
        return result if isinstance(result, list) else []

    async def insert(
        self,
        table: str,
        token: str,
        body: dict[str, Any],
        *,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        result = await self.request(
            "POST", f"/rest/v1/{table}", token=token, params=params, body=body,
            prefer="return=representation",
        )
        return result[0] if isinstance(result, list) and result else None

    async def update(
        self,
        table: str,
        token: str,
        params: dict[str, str],
        body: dict[str, Any],
    ) -> list[dict[str, Any]]:
        result = await self.request(
            "PATCH", f"/rest/v1/{table}", token=token, params=params, body=body,
            prefer="return=representation",
        )
        return result if isinstance(result, list) else []

    async def rpc(self, name: str, token: str, body: dict[str, Any]) -> Any:
        return await self.request("POST", f"/rest/v1/rpc/{quote(name, safe='')}", token=token, body=body)
