from __future__ import annotations

import httpx

from src.core.logging import get_logger
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool
from src.services.tools.local.context import LocationService

logger = get_logger(__name__)

WEATHER_CODES = {
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
            "place": {
                "type": "string",
                "description": "Place name, e.g. 'Hamburg'. Omit for your own location.",
            },
            "days": {
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

    async def run(self, place: str | None = None, days: int = 3) -> str:
        if place:
            coordinates = await self._geocode(place)
            if coordinates is None:
                raise ToolError(f"Place {place!r} not found.")
            latitude, longitude, name = coordinates
        else:
            location = await self._locations.get()
            if location.latitude is None or location.longitude is None:
                raise ToolError("No location known. Name a place.")
            latitude, longitude = location.latitude, location.longitude
            name = ", ".join(x for x in (location.city, location.country) if x)

        days = max(0, min(int(days), 7))
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                       "precipitation,weather_code,wind_speed_10m",
            "timezone": "auto",
        }
        if days:
            params["daily"] = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"
            params["forecast_days"] = days

        response = await self._client.get(self.FORECAST, params=params)
        if response.status_code != 200:
            raise ToolError(f"Weather service unreachable (HTTP {response.status_code}).")

        data = response.json()
        now = data.get("current") or {}
        lines = [
            f"Weather for {name or 'the current location'}:",
            f"  now: {_description(now.get('weather_code'))}, "
            f"{now.get('temperature_2m')} °C "
            f"(feels like {now.get('apparent_temperature')} °C), "
            f"wind {now.get('wind_speed_10m')} km/h, "
            f"humidity {now.get('relative_humidity_2m')} %",
        ]

        daily = data.get("daily") or {}
        for index, date in enumerate(daily.get("time") or []):
            lines.append(
                f"  {date}: {_description(daily['weather_code'][index])}, "
                f"{daily['temperature_2m_min'][index]}–"
                f"{daily['temperature_2m_max'][index]} °C, "
                f"precipitation {daily['precipitation_sum'][index]} mm"
            )
        return "\n".join(lines)

    async def _geocode(self, place: str) -> tuple[float, float, str] | None:
        response = await self._client.get(
            self.GEOCODE, params={"name": place, "count": 1, "language": "en"}
        )
        if response.status_code != 200:
            return None
        matched = (response.json().get("results") or [None])[0]
        if not matched:
            return None
        caption = ", ".join(
            x for x in (matched.get("name"), matched.get("country")) if x
        )
        return matched["latitude"], matched["longitude"], caption


def _description(code: object) -> str:
    try:
        return WEATHER_CODES.get(int(code), f"code {code}")  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "unknown"
