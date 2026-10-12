from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from pathlib import Path

from src.core.logging import get_logger
from src.services.audio.base import (
    Transcript,
    TranscriptionError,
    TranscriptionService,
)

logger = get_logger(__name__)


class WhisperService(TranscriptionService):
    def __init__(
        self,
        *,
        binary: str,
        model: Path,
        ffmpeg: str = "ffmpeg",
        threads: int = 0,
        timeout: float = 120.0,
        max_bytes: int = 25_000_000,
    ) -> None:
        self._binary = binary
        self._model = model
        self._ffmpeg = ffmpeg
        self._threads = threads
        self._timeout = timeout
        self._max_bytes = max_bytes

    @property
    def model_name(self) -> str:
        return self._model.stem

    @property
    def available(self) -> bool:
        return (
            shutil.which(self._binary) is not None
            and shutil.which(self._ffmpeg) is not None
            and self._model.is_file()
        )

    def why_unavailable(self) -> str | None:
        if shutil.which(self._ffmpeg) is None:
            return f"{self._ffmpeg!r} is not installed."
        if shutil.which(self._binary) is None:
            return f"{self._binary!r} is not installed (brew install whisper-cpp)."
        if not self._model.is_file():
            return f"Whisper model missing at {self._model}."
        return None

    async def transcribe(
        self,
        audio: bytes,
        *,
        language: str | None = None,
        mime: str | None = None,
        filename: str | None = None,
    ) -> Transcript:
        if not audio:
            raise TranscriptionError("The recording is empty.")
        if len(audio) > self._max_bytes:
            raise TranscriptionError(
                f"The recording is larger than {self._max_bytes // 1_000_000} MB."
            )
        if (reason := self.why_unavailable()) is not None:
            raise TranscriptionError(reason)

        with tempfile.TemporaryDirectory(prefix="smeeware-stt-") as folder:
            basis = Path(folder)
            raw = basis / "input"
            wav = basis / "audio.wav"
            raw.write_bytes(audio)

            await self._ffmpeg_to_wav(raw, wav)
            return await self._whisper(wav, language)

    async def _ffmpeg_to_wav(self, source: Path, target: Path) -> None:
        code, _, error = await self._run(
            self._ffmpeg,
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            "-y",
            str(target),
        )
        if code != 0 or not target.is_file():
            logger.warning("ffmpeg failed: %s", error[-400:])
            raise TranscriptionError("The recording could not be decoded.")

    async def _whisper(self, wav: Path, language: str | None) -> Transcript:
        output = wav.with_suffix("")
        arguments = [
            self._binary,
            "-m",
            str(self._model),
            "-f",
            str(wav),
            "-l",
            language or "auto",
            "-oj",
            "-of",
            str(output),
            "--no-prints",
        ]
        if self._threads > 0:
            arguments += ["-t", str(self._threads)]

        code, _, error = await self._run(*arguments)
        json_file = output.with_suffix(".json")
        if code != 0 or not json_file.is_file():
            logger.warning("whisper failed: %s", error[-400:])
            raise TranscriptionError("Transcription failed.")

        return _from_json(json.loads(json_file.read_text(encoding="utf-8")))

    async def _run(self, *arguments: str) -> tuple[int, str, str]:
        process = await asyncio.create_subprocess_exec(
            *arguments,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, error = await asyncio.wait_for(
                process.communicate(), timeout=self._timeout
            )
        except TimeoutError:
            process.kill()
            await process.wait()
            raise TranscriptionError(
                f"Transcription took longer than {int(self._timeout)}s."
            ) from None

        return (
            process.returncode or 0,
            stdout.decode("utf-8", "replace"),
            error.decode("utf-8", "replace"),
        )


def _from_json(payload: dict) -> Transcript:
    chunks = [
        str(entry.get("text", "")) for entry in payload.get("transcription", [])
    ]
    text = " ".join(part.strip() for part in chunks if part.strip())

    result = payload.get("result") or {}
    language = result.get("language")

    duration = 0
    for entry in reversed(payload.get("transcription", [])):
        end = (entry.get("offsets") or {}).get("to")
        if isinstance(end, int):
            duration = end
            break

    return Transcript(text=text, language=language or None, duration_ms=duration)
