"""Wetter ueber Open-Meteo.

Bewusst nicht OpenWeather: Open-Meteo braucht keinen API-Schluessel, liefert
Vorhersage und Gegenwart in einem Aufruf und hat keine Freikontingent-Grenze,
gegen die man im Betrieb laeuft.
"""

from __future__ import annotations

import httpx

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool
from src.services.tools.local.context import LocationService

logger = get_logger(__name__)

WETTER = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle",
    55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains", 80: "rain showers", 81: "rain showers",
    82: "violent rain showers", 85: "snow showers", 86: "snow showers",
    95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
}


class WeatherTool(LocalTool):
    name = "get_weather"
    description = (
        "Current weather and forecast. Without a location, the position is "
        "taken from the public IP -- so for 'what's the weather here' you "
        "don't need an argument."
    )
    parameters = {
        "type": "object",
        "properties": {
            "ort": {
                "type": "string",
                "description": "Place name, e.g. 'Hamburg'. Omit for your own location.",
            },
            "tage": {
                "type": "integer",
                "description": "Forecast days 0-7 (default 3, 0 = only now)",
            },
        },
    }

    GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
    FORECAST = "https://api.open-meteo.com/v1/forecast"

    def __init__(self, client: httpx.AsyncClient, locations: LocationService) -> None:
        self._client = client
        self._locations = locations

    async def run(self, ort: str | None = None, tage: int = 3) -> str:
        if ort:
            koordinaten = await self._geocode(ort)
            if koordinaten is None:
                raise ToolError(f"Place {ort!r} not found.")
            breite, laenge, name = koordinaten
        else:
            standort = await self._locations.get()
            if standort.latitude is None or standort.longitude is None:
                raise ToolError("No location known. Name a place.")
            breite, laenge = standort.latitude, standort.longitude
            name = ", ".join(x for x in (standort.city, standort.country) if x)

        tage = max(0, min(int(tage), 7))
        params = {
            "latitude": breite,
            "longitude": laenge,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                       "precipitation,weather_code,wind_speed_10m",
            "timezone": "auto",
        }
        if tage:
            params["daily"] = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"
            params["forecast_days"] = tage

        response = await self._client.get(self.FORECAST, params=params)
        if response.status_code != 200:
            raise ToolError(f"Weather service unreachable (HTTP {response.status_code}).")

        data = response.json()
        jetzt = data.get("current") or {}
        zeilen = [
            f"Weather for {name or 'the current location'}:",
            f"  now: {_beschreibung(jetzt.get('weather_code'))}, "
            f"{jetzt.get('temperature_2m')} °C "
            f"(feels like {jetzt.get('apparent_temperature')} °C), "
            f"wind {jetzt.get('wind_speed_10m')} km/h, "
            f"humidity {jetzt.get('relative_humidity_2m')} %",
        ]

        taeglich = data.get("daily") or {}
        for index, datum in enumerate(taeglich.get("time") or []):
            zeilen.append(
                f"  {datum}: {_beschreibung(taeglich['weather_code'][index])}, "
                f"{taeglich['temperature_2m_min'][index]}–"
                f"{taeglich['temperature_2m_max'][index]} °C, "
                f"precipitation {taeglich['precipitation_sum'][index]} mm"
            )
        return "\n".join(zeilen)

    async def _geocode(self, ort: str) -> tuple[float, float, str] | None:
        response = await self._client.get(
            self.GEOCODE, params={"name": ort, "count": 1, "language": "en"}
        )
        if response.status_code != 200:
            return None
        treffer = (response.json().get("results") or [None])[0]
        if not treffer:
            return None
        beschriftung = ", ".join(
            x for x in (treffer.get("name"), treffer.get("country")) if x
        )
        return treffer["latitude"], treffer["longitude"], beschriftung


def _beschreibung(code: object) -> str:
    try:
        return WETTER.get(int(code), f"code {code}")  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "unknown"
