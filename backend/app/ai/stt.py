from app.ai.groq_client import get_client

WHISPER_MODEL = "whisper-large-v3-turbo"


def transcribe(audio_bytes: bytes, filename: str) -> str:
    """Transcribe an audio blob using Groq's hosted Whisper model.

    `filename` is needed because the Groq SDK uses it to infer the audio format.
    Webm/opus from the browser MediaRecorder is supported natively.
    """
    client = get_client()
    result = client.audio.transcriptions.create(
        file=(filename, audio_bytes),
        model=WHISPER_MODEL,
        response_format="text",
    )
    if isinstance(result, str):
        return result.strip()
    # SDK may return an object with `.text` when response_format=json
    return getattr(result, "text", "").strip()
