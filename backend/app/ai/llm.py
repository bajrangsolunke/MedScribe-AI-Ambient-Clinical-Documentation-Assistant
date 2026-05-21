from __future__ import annotations

import json
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.ai.groq_client import get_client

DEFAULT_MODEL = "llama-3.3-70b-versatile"

T = TypeVar("T", bound=BaseModel)


class LlmJsonError(RuntimeError):
    """Raised when the LLM cannot produce JSON that matches the target schema."""


def complete_json(
    prompt: str,
    schema: type[T],
    model: str = DEFAULT_MODEL,
    max_retries: int = 3,
    temperature: float = 0.2,
) -> T:
    """Call Groq chat completion with JSON mode and parse into `schema`.

    Retries up to `max_retries` times when the response cannot be parsed.
    Each retry appends a stricter reminder of the schema to the prompt.
    """
    client = get_client()
    last_error: Exception | None = None
    current_prompt = prompt

    for attempt in range(1, max_retries + 1):
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise medical assistant. "
                        "Respond ONLY with valid JSON matching the requested schema. "
                        "No prose, no markdown fences, no commentary."
                    ),
                },
                {"role": "user", "content": current_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
        )
        raw = completion.choices[0].message.content or ""
        try:
            data = json.loads(raw)
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            current_prompt = (
                f"{prompt}\n\nIMPORTANT: your previous response failed validation "
                f"({type(exc).__name__}: {exc}). "
                f"Return ONLY a JSON object matching this schema:\n"
                f"{json.dumps(schema.model_json_schema())}"
            )

    raise LlmJsonError(
        f"LLM produced invalid JSON after {max_retries} attempts: {last_error}"
    ) from last_error
