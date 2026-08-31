"""Entwicklungs-Entrypoint: ``python run.py`` im Ordner ``backend``.

Fuer Produktion stattdessen direkt:
    uvicorn src.app:app --host 0.0.0.0 --port 8000 --workers 4
"""

from __future__ import annotations

import uvicorn

from src.core.config import get_settings


def main() -> None:
    settings = get_settings()
    reload = not settings.is_production

    uvicorn.run(
        "src.app:app",
        host=settings.host,
        port=settings.port,
        reload=reload,
        reload_dirs=["src"] if reload else None,
        log_level="debug" if settings.debug else "info",
        # Ohne Grenze wartet uvicorn beim Herunterfahren auf jede offene
        # Verbindung -- und der Ereignis-Strom (SSE) ist per Definition
        # nie fertig. Mit --reload hiesse das: der erste verbundene Browser
        # laesst jede Dateiaenderung den Server stehen. Drei Sekunden sind
        # reichlich fuer alles, was wirklich zu Ende gehen will.
        timeout_graceful_shutdown=3,
    )


if __name__ == "__main__":
    main()
