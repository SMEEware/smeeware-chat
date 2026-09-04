"""Liest die MCP-Serverliste.

Format wie bei Claude Desktop, damit sich bestehende Konfigurationen
uebernehmen lassen::

    {"mcpServers": {"time": {"command": "uvx", "args": ["mcp-server-time"]}}}
"""

from __future__ import annotations

import json
from pathlib import Path

from src.core.logging import get_logger
from src.services.tools.mcp_toolbox import McpServerConfig

logger = get_logger(__name__)


def load_mcp_servers(path: Path) -> list[McpServerConfig]:
    if not path.exists():
        logger.info("Keine MCP-Konfiguration unter %s -- keine Werkzeuge", path)
        return []

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("MCP-Konfiguration %s unlesbar: %s", path, exc)
        return []

    servers: list[McpServerConfig] = []
    for name, entry in (raw.get("mcpServers") or {}).items():
        command = (entry or {}).get("command")
        if not command:
            logger.warning("MCP-Server %r ohne command -- uebersprungen", name)
            continue
        servers.append(
            McpServerConfig(
                name=name,
                command=command,
                args=tuple(entry.get("args") or ()),
                env=entry.get("env"),
                enabled=entry.get("enabled", True),
            )
        )

    logger.info("%d MCP-Server konfiguriert (%s)", len(servers), path)
    return servers
