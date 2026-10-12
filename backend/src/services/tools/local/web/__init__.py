from __future__ import annotations

import httpx

from src.core.config import ToolSettings
from src.services.tools.local.base import LocalTool
from src.services.tools.local.web.fetcher import FetchError, Page, PageFetcher
from src.services.tools.local.web.tools import (
    BatchFetchTool,
    ExtractSelectorsTool,
    ExtractTablesTool,
    FetchJsonTool,
    FetchPageTool,
    ListLinksTool,
)


def create_web_tools(
    client: httpx.AsyncClient, settings: ToolSettings
) -> list[LocalTool]:
    fetcher = PageFetcher(
        client,
        max_bytes=settings.scrape_max_bytes,
        cache_ttl=settings.scrape_cache_ttl,
        concurrency=settings.scrape_concurrency,
        host_delay=settings.scrape_host_delay,
    )
    limit = settings.scrape_max_chars
    return [
        FetchPageTool(fetcher, limit),
        ExtractSelectorsTool(fetcher, limit),
        ExtractTablesTool(fetcher, limit),
        ListLinksTool(fetcher, limit),
        FetchJsonTool(fetcher, limit),
        BatchFetchTool(fetcher, limit),
    ]


__all__ = ["FetchError", "Page", "PageFetcher", "create_web_tools"]
