from __future__ import annotations

from dataclasses import dataclass, field

MAX_PER_STREAM = 20


@dataclass(frozen=True, slots=True)
class Interjection:
    id: str
    text: str


@dataclass(slots=True)
class _Mailbox:
    open_items: list[Interjection] = field(default_factory=list)


class SteeringRegistry:
    def __init__(self) -> None:
        self._mailboxes: dict[str, _Mailbox] = {}

    def open(self, stream_id: str) -> None:
        self._mailboxes.setdefault(stream_id, _Mailbox())

    def close(self, stream_id: str) -> None:
        self._mailboxes.pop(stream_id, None)

    def submit(self, stream_id: str, interjection: Interjection) -> bool:
        mailbox = self._mailboxes.get(stream_id)
        if mailbox is None or len(mailbox.open_items) >= MAX_PER_STREAM:
            return False
        if any(e.id == interjection.id for e in mailbox.open_items):
            return True
        mailbox.open_items.append(interjection)
        return True

    def withdraw(self, stream_id: str, interjection_id: str) -> bool:
        mailbox = self._mailboxes.get(stream_id)
        if mailbox is None:
            return False
        previous = len(mailbox.open_items)
        mailbox.open_items = [e for e in mailbox.open_items if e.id != interjection_id]
        return len(mailbox.open_items) < previous

    def clear(self, stream_id: str) -> list[Interjection]:
        mailbox = self._mailboxes.get(stream_id)
        if mailbox is None or not mailbox.open_items:
            return []
        drained, mailbox.open_items = mailbox.open_items, []
        return drained


STEERING = SteeringRegistry()
