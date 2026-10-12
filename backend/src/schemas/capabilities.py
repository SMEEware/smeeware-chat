from __future__ import annotations

from pydantic import BaseModel


class CapabilitiesResponse(BaseModel):
    sharing: bool
