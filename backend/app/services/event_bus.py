"""In-memory pub/sub of pipeline events, keyed by session_id.

Producers (ScribePipeline) push dicts; consumers (the SSE endpoint) await
them. Uses a per-session asyncio.Queue so each subscriber gets a clean
stream from the moment they connect.
"""

from __future__ import annotations

import asyncio
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self._queues: dict[int, asyncio.Queue[dict[str, Any]]] = {}

    def queue_for(self, session_id: int) -> asyncio.Queue[dict[str, Any]]:
        if session_id not in self._queues:
            self._queues[session_id] = asyncio.Queue()
        return self._queues[session_id]

    async def publish(self, session_id: int, event: dict[str, Any]) -> None:
        await self.queue_for(session_id).put(event)

    def publish_sync(self, session_id: int, event: dict[str, Any]) -> None:
        """Sync variant for use from non-async pipeline code."""
        self.queue_for(session_id).put_nowait(event)

    def drop(self, session_id: int) -> None:
        self._queues.pop(session_id, None)


event_bus = EventBus()
