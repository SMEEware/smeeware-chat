"""Research-only toolbox with its own HTTP client; no desktop/MCP/task services."""
from __future__ import annotations

import asyncio
import ipaddress
import socket

import httpx

from src.core.config import ToolSettings
from src.services.tools.local.base import LocalToolBox
from src.services.tools.local.search import BraveAnswersTool, BraveSearchTool, SerpApiSearchTool
from src.services.tools.local.web import create_web_tools


async def public_address(url: httpx.URL) -> str:
    if url.scheme not in {"http", "https"} or not url.host or url.userinfo or url.port not in {None, 80, 443}:
        raise httpx.RequestError("IDE research requires a public HTTP(S) URL on a standard port.")
    host = url.host.rstrip(".").lower()
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise httpx.RequestError("IDE research cannot access local or internal services.")
    try:
        records = await asyncio.get_running_loop().getaddrinfo(host, url.port or (443 if url.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError as exc:
        raise httpx.RequestError("The research hostname could not be resolved.") from exc
    addresses = list(dict.fromkeys(record[4][0] for record in records))
    if not addresses or any(not (ipaddress.ip_address(address).is_global and not ipaddress.ip_address(address).is_multicast and not ipaddress.ip_address(address).is_reserved) for address in addresses):
        raise httpx.RequestError("IDE research cannot access private or reserved addresses.")
    addresses.sort(key=lambda address: ipaddress.ip_address(address).version)
    return addresses[0]


class PublicWebTransport(httpx.AsyncBaseTransport):
    """Pin each connection to a validated IP while preserving Host, TLS and URL.

    The original request stays unchanged so redirects resolve against the source
    hostname and every redirect is validated again. Environment proxies are off.
    """
    def __init__(self):
        self.inner = httpx.AsyncHTTPTransport(trust_env=False)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        address = await public_address(request.url)
        extensions = {**request.extensions, "sni_hostname": request.url.host}
        headers = request.headers.copy()
        if request.url.host != "api.search.brave.com":
            # httpx strips Authorization across redirects, but not arbitrary API
            # headers. Brave credentials must never follow a public-site redirect.
            headers.pop("X-Subscription-Token", None)
            headers.pop("Authorization", None)
        pinned = httpx.Request(request.method, request.url.copy_with(host=address),
                               headers=headers, stream=request.stream, extensions=extensions)
        return await self.inner.handle_async_request(pinned)

    async def aclose(self):
        await self.inner.aclose()


class IdeWebToolBox(LocalToolBox):
    def __init__(self, settings: ToolSettings):
        self.client = httpx.AsyncClient(transport=PublicWebTransport(), follow_redirects=True,
                                       max_redirects=5, timeout=settings.http_timeout or 30, trust_env=False)
        tools = create_web_tools(self.client, settings)
        if settings.brave_api_key:
            tools.append(BraveSearchTool(self.client, settings.brave_api_key.get_secret_value()))
        if settings.serpapi_api_key:
            tools.append(SerpApiSearchTool(self.client, settings.serpapi_api_key.get_secret_value()))
        if settings.brave_answers_enabled and settings.brave_answers_api_key:
            tools.append(BraveAnswersTool(self.client, settings.brave_answers_api_key.get_secret_value()))
        super().__init__(tools)

    async def aclose(self):
        await self.client.aclose()
