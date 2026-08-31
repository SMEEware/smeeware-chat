"""Gesprochenes zu Text -- gehostet oder lokal."""

from src.services.audio.base import (
    Transkript,
    TranscriptionError,
    TranscriptionService,
)
from src.services.audio.openai_stt import OpenAITranscribeService
from src.services.audio.whisper import WhisperService

__all__ = [
    "OpenAITranscribeService",
    "Transkript",
    "TranscriptionError",
    "TranscriptionService",
    "WhisperService",
]
