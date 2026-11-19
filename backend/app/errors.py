from __future__ import annotations


class SupabaseError(Exception):
    def __init__(self, status_code: int, code: str, message: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class AuthenticationError(Exception):
    pass


class ShopAccessError(Exception):
    pass
