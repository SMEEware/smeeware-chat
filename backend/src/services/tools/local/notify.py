from __future__ import annotations

from typing import Any

from src.core.logging import get_logger
from collections.abc import Callable

from src.services.events import EventBus
from src.services.notifications import EncryptedNotifications

NotificationSource = Callable[[], EncryptedNotifications | None]
from src.services.tools.base import ToolError
from src.services.tools.local.base import LocalTool

logger = get_logger(__name__)

LEVELS = ("info", "success", "warning", "error")


class NotifyUserTool(LocalTool):
    name = "notify_user"
    description = (
        "Shows a short notification to the user, outside the conversation. "
        "USE THIS ALMOST NEVER. The normal way to tell the user something is "
        "to write it in your answer, where they are already reading. A "
        "notification interrupts, and one that was not worth interrupting for "
        "teaches them to ignore the next one. "
        "Justified only when something happened that they need to know about "
        "and would otherwise miss: a long task finished while they were "
        "elsewhere, an action had a consequence they did not ask for, "
        "something failed in a way that silently changes what your answer is "
        "worth. "
        "Never use it to greet, to confirm you understood, to announce that "
        "you are starting, to repeat what your answer already says, or "
        "because the notification would look nice. If you are unsure, that is "
        "the answer: do not send one."
    )
    parameters = {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": (
                    "One short line, the point itself. Not 'Notice' or "
                    "'Info' -- say what happened."
                ),
            },
            "body": {
                "type": "string",
                "description": (
                    "Optional second line with the detail that makes the "
                    "title actionable. Leave it out if the title says it all."
                ),
            },
            "level": {
                "type": "string",
                "enum": list(LEVELS),
                "description": (
                    "info for something worth knowing, success for a task "
                    "that finished, warning for something that needs "
                    "attention, error for something that went wrong."
                ),
            },
        },
        "required": ["title"],
    }

    def __init__(self, bus: EventBus, notices: NotificationSource | None = None) -> None:
        self._bus = bus
        self._notifications = notices

    async def run(self, **kwargs: Any) -> str:
        title = str(kwargs.get("title") or "").strip()
        if not title:
            raise ToolError("title must not be empty.")

        level = str(kwargs.get("level") or "info").lower()
        if level not in LEVELS:
            level = "info"

        text = str(kwargs.get("body") or "").strip() or None

        title = title[:120]
        text = text[:280] if text else None

        saved = None
        if self._notifications is not None and (memory := self._notifications()):
            try:
                saved = await memory.add(level, title, text)
            except Exception:  # noqa: BLE001
                logger.exception("Could not save notification")

        reached = await self._bus.publish(
            {
                "type": "toast",
                "id": saved.id if saved else None,
                "level": level,
                "title": title,
                "body": text,
            }
        )

        logger.info("notify_user(%s): %s -> %d Client(s)", level, title[:60], reached)

        if reached == 0:
            return (
                "No client was connected, so the notification was not shown. "
                "Put anything important into your answer instead."
            )
        return f"Notification shown to the user ({level})."
