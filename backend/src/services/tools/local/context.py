"""Wo bin ich, wie spaet ist es, worauf laufe ich.

Der Standort kommt aus der oeffentlichen IP -- die IP selbst wird bewusst
nirgends zurueckgegeben, weder ans Modell noch ins Log. Gebraucht wird nur,
was daraus folgt: Land, Region, Zeitzone, Koordinaten.
"""

from __future__ import annotations

import json
import locale as locale_module
import os
import platform
import time
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from src.core.logging import get_logger
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)

CACHE_TTL_SECONDS = 15 * 60


@dataclass(frozen=True, slots=True)
class Location:
    city: str | None = None
    region: str | None = None
    country: str | None = None
    country_code: str | None = None
    timezone: str | None = None
    latitude: float | None = None
    longitude: float | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "city": self.city,
            "region": self.region,
            "country": self.country,
            "country_code": self.country_code,
            "timezone": self.timezone,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


class LocationService:
    """Ermittelt den Standort einmal und merkt ihn sich.

    Geteilt zwischen Kontext- und Wetterwerkzeug, damit eine Wetterfrage
    ohne Ortsangabe nicht erst eine zweite Werkzeugrunde braucht.
    """

    # Beide liefern ueber HTTPS und ohne Schluessel.
    ENDPOINTS = ("https://ipwho.is/", "https://ipapi.co/json/")

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client
        self._cached: Location | None = None
        self._fetched_at = 0.0

    async def get(self) -> Location:
        if self._cached and time.monotonic() - self._fetched_at < CACHE_TTL_SECONDS:
            return self._cached

        for endpoint in self.ENDPOINTS:
            try:
                response = await self._client.get(endpoint)
                if response.status_code != 200:
                    continue
                location = _parse(response.json())
            except Exception as exc:  # noqa: BLE001 -- naechster Anbieter
                logger.info("Standortdienst %s nicht erreichbar: %s", endpoint, exc)
                continue

            if location.country or location.timezone:
                self._cached = location
                self._fetched_at = time.monotonic()
                # Nur die Ableitung loggen, nie die IP.
                logger.info(
                    "Standort ermittelt: %s, %s (%s)",
                    location.city or "?",
                    location.country or "?",
                    location.timezone or "?",
                )
                return location

        logger.warning("Standort konnte nicht ermittelt werden")
        return Location()


def _parse(data: dict) -> Location:
    """Vereint die Feldnamen von ipwho.is und ipapi.co."""
    zeitzone = data.get("timezone")
    if isinstance(zeitzone, dict):  # ipwho.is verschachtelt
        zeitzone = zeitzone.get("id")

    return Location(
        city=data.get("city"),
        region=data.get("region"),
        country=data.get("country") or data.get("country_name"),
        country_code=data.get("country_code"),
        timezone=zeitzone,
        latitude=_float(data.get("latitude")),
        longitude=_float(data.get("longitude")),
    )


def _float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


class ContextTool(LocalTool):
    name = "get_context"
    description = (
        "Returns the current context: location (from the public IP, without "
        "the IP itself), timezone, local time and date, language and system. "
        "Call this before answering questions about time, weather, holidays, "
        "opening hours, currency, or 'here'/'near me' -- otherwise you are "
        "guessing the region."
    )
    parameters = {"type": "object", "properties": {}}

    def __init__(self, locations: LocationService) -> None:
        self._locations = locations

    async def run(self) -> str:
        location = await self._locations.get()

        jetzt_lokal = datetime.now().astimezone()
        bild: dict[str, object] = {
            "location": location.as_dict(),
            "time": {
                "server_local_time": jetzt_lokal.isoformat(timespec="seconds"),
                "server_timezone": str(jetzt_lokal.tzinfo),
                "utc": datetime.now(ZoneInfo("UTC")).isoformat(timespec="seconds"),
            },
            "language": _language(),
            "system": _system(),
        }

        if location.timezone:
            try:
                ort_jetzt = datetime.now(ZoneInfo(location.timezone))
                bild["time"]["time_at_location"] = ort_jetzt.isoformat(timespec="seconds")
                bild["time"]["weekday"] = ort_jetzt.strftime("%A")
            except (ZoneInfoNotFoundError, ValueError):
                pass

        return json.dumps(bild, ensure_ascii=False, indent=2)


def _language() -> dict[str, object]:
    try:
        sprache, kodierung = locale_module.getlocale()
    except ValueError:
        sprache, kodierung = None, None
    return {
        "locale": sprache,
        "encoding": kodierung,
        "environment": os.getenv("LANG") or os.getenv("LC_ALL"),
    }


def _system() -> dict[str, object]:
    return {
        "os": platform.system(),
        "version": platform.release(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "cpus": os.cpu_count(),
    }
