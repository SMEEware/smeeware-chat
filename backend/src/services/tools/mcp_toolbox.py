from __future__ import annotations

import asyncio
import json
from collections.abc import Sequence
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from src.core.logging import get_logger
from src.services.tools.base import (
    ToolBox,
    ToolCall,
    ToolResult,
    ToolSpec,
    qualified_name,
    split_qualified,
)

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class McpServerConfig:
    name: str
    command: str
    args: tuple[str, ...] = ()
    env: dict[str, str] | None = None
    enabled: bool = True


class McpToolBox(ToolBox):
    def __init__(
        self,
        servers: Sequence[McpServerConfig],
        *,
        connect_timeout: float = 30.0,
        call_timeout: float = 60.0,
    ) -> None:
        self._configs = [s for s in servers if s.enabled]
        self._connect_timeout = connect_timeout
        self._call_timeout = call_timeout

        self._stack = AsyncExitStack()
        self._sessions: dict[str, ClientSession] = {}
        self._specs: list[ToolSpec] = []
        self._started = False


    async def start(self) -> None:
        if self._started:
            return
        self._started = True

        for config in self._configs:
            try:
                await asyncio.wait_for(
                    self._connect(config), timeout=self._connect_timeout
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "MCP server %r unavailable: %s: %s",
                    config.name,
                    type(exc).__name__,
                    exc,
                )

        logger.info(
            "MCP ready: %d server(s), %d tool(s) (%s)",
            len(self._sessions),
            len(self._specs),
            ", ".join(sorted(self._sessions)) or "-",
        )

    async def _connect(self, config: McpServerConfig) -> None:
        params = StdioServerParameters(
            command=config.command,
            args=list(config.args),
            env=config.env,
        )
        read, write = await self._stack.enter_async_context(stdio_client(params))
        session = await self._stack.enter_async_context(ClientSession(read, write))
        await session.initialize()

        listing = await session.list_tools()
        for tool in listing.tools:
            self._specs.append(
                ToolSpec(
                    name=qualified_name(config.name, tool.name),
                    description=(tool.description or tool.name)[:1024],
                    parameters=_attr(tool, "input_schema", "inputSchema") or {},
                )
            )

        self._sessions[config.name] = session
        logger.info(
            "MCP server %r connected (%d tools)", config.name, len(listing.tools)
        )

    async def aclose(self) -> None:
        await self._stack.aclose()
        self._sessions.clear()
        self._specs.clear()
        self._started = False


    async def specs(self) -> Sequence[ToolSpec]:
        return tuple(self._specs)

    async def invoke(self, call: ToolCall) -> ToolResult:
        server, tool = split_qualified(call.name)
        session = self._sessions.get(server)

        if session is None:
            return self._error(call, f"No MCP server named {server!r} is connected.")

        try:
            if self._call_timeout and self._call_timeout > 0:
                response = await asyncio.wait_for(
                    session.call_tool(tool, call.arguments),
                    timeout=self._call_timeout,
                )
            else:
                response = await session.call_tool(tool, call.arguments)
        except TimeoutError:
            return self._error(call, f"{call.name} did not respond in time.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Tool %s failed: %s", call.name, exc)
            return self._error(call, f"{type(exc).__name__}: {exc}")

        return ToolResult(
            call_id=call.id,
            name=call.name,
            content=_render(response),
            is_error=bool(_attr(response, "is_error", "isError", default=False)),
        )

    @staticmethod
    def _error(call: ToolCall, message: str) -> ToolResult:
        return ToolResult(call_id=call.id, name=call.name, content=message, is_error=True)


def _attr(obj: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        value = getattr(obj, name, None)
        if value is not None:
            return value
    return default


def _render(response: Any) -> str:
    structured = _attr(response, "structured_content", "structuredContent")
    if structured:
        return json.dumps(structured, ensure_ascii=False)

    parts: list[str] = []
    for item in getattr(response, "content", None) or []:
        text = getattr(item, "text", None)
        if text:
            parts.append(text)
            continue
        parts.append(f"[{getattr(item, 'type', 'unknown')}]")

    return "\n".join(parts) if parts else "(empty result)"
