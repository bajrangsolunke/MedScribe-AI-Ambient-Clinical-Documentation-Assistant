"""Thread-safe in-memory pub/sub of pipeline events, keyed by session_id.

Producers (ScribePipeline) run inside FastAPI's threadpool via BackgroundTask.
Consumers (the SSE endpoint) run in the asyncio event loop. Using
`queue.Queue` (thread-safe) and awaiting via `asyncio.to_thread(q.get, ...)`
sidesteps asyncio.Queue's no-thread-safety constraint.
"""

from __future__ import annotations

import queue
from typing import Any

# Sentinel pushed onto a session's queue when the pipeline emits the
# `pipeline:complete` or `pipeline:error` event, so the SSE consumer can
# cleanly close the stream after delivering the final event.
SENTINEL_CLOSE: dict[str, Any] = {"__close__": True}


class EventBus:
    def __init__(self) -> None:
        self._queues: dict[int, queue.Queue[dict[str, Any]]] = {}

    def queue_for(self, session_id: int) -> queue.Queue[dict[str, Any]]:
        if session_id not in self._queues:
            self._queues[session_id] = queue.Queue()
        return self._queues[session_id]

    def publish_sync(self, session_id: int, event: dict[str, Any]) -> None:
        """Push an event from any thread."""
        self.queue_for(session_id).put(event)
        # Auto-close the stream when the pipeline is terminal
        if event.get("stage") == "pipeline" and event.get("status") in ("complete", "error"):
            self.queue_for(session_id).put(SENTINEL_CLOSE)

    def drop(self, session_id: int) -> None:
        self._queues.pop(session_id, None)


event_bus = EventBus()
