from __future__ import annotations

from typing import Any


class AppError(Exception):
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
    status_code = 500
    code = "configuration_error"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class FileTooLargeError(AppError):
    status_code = 413
    code = "file_too_large"

    def __init__(self, filename: str, max_bytes: int) -> None:
        super().__init__(
            f"{filename} exceeds the upload limit.",
            details={"filename": filename, "max_bytes": max_bytes},
        )


class TooManyFilesError(AppError):
    status_code = 422
    code = "too_many_files"

    def __init__(self, max_files: int) -> None:
        super().__init__(
            f"At most {max_files} files per request.", details={"max_files": max_files},
        )


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ProviderError(AppError):
    status_code = 502
    code = "provider_error"


class ProviderTimeoutError(ProviderError):
    status_code = 504
    code = "provider_timeout"


class RateLimitedError(ProviderError):
    status_code = 429
    code = "rate_limited"
