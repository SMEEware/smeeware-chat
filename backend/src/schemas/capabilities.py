from __future__ import annotations

from pydantic import BaseModel


class CapabilitiesResponse(BaseModel):
    sharing: bool
    uploads: bool
    uploads_max_bytes: int
    uploads_max_files: int
