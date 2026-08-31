"""Domaenen-Fehler und ihre Uebersetzung in HTTP-Antworten.

Services werfen ``AppError``-Subklassen und wissen nichts von HTTP. Erst der
Handler in ``src.app`` macht daraus eine JSON-Antwort.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Basis aller erwarteten Fehler der Anwendung."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message or self.__doc__ or self.code)
        self.message = message or self.code
        self.details = details or {}

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"error": {"code": self.code, "message": self.message}}
        if self.details:
            payload["error"]["details"] = self.details
        return payload


class ConfigurationError(AppError):
    """Die Anwendung ist fehlerhaft konfiguriert."""

    status_code = 500
    code = "configuration_error"


class ValidationError(AppError):
    """Die Anfrage ist inhaltlich ungueltig."""

    status_code = 422
    code = "validation_error"


class NotFoundError(AppError):
    """Die angefragte Ressource gibt es nicht."""

    status_code = 404
    code = "not_found"


class UnauthorizedError(AppError):
    """Authentifizierung fehlt oder ist ungueltig."""

    status_code = 401
    code = "unauthorized"


class ProviderError(AppError):
    """Der Upstream-Provider hat die Anfrage nicht beantwortet."""

    status_code = 502
    code = "provider_error"


class ProviderTimeoutError(ProviderError):
    """Der Upstream-Provider hat nicht rechtzeitig geantwortet."""

    status_code = 504
    code = "provider_timeout"


class RateLimitedError(ProviderError):
    """Das Kontingent des Upstream-Providers ist erschoepft."""

    status_code = 429
    code = "rate_limited"
