"""Gesprochenes zu Text -- lokal, ueber whisper.cpp.

Warum nicht die Spracherkennung des Browsers: die verlangt, dass man die
Sprache vorher waehlt. Whisper erkennt sie selbst, und genau das ist der
Punkt bei mehrsprachiger Eingabe -- wer mitten im Satz wechselt, soll nicht
vorher ein Menue bedienen.

Warum nicht ueber den Anbieter: DeepSeek hat keine Transkription, und Ollama
faehrt Sprachmodelle, kein Audio. Das hier ist ein eigener Prozess, und weil
er lokal laeuft, verlaesst die Aufnahme die Maschine nicht.

Zwei Programme, beide als Unterprozess: ``ffmpeg`` bringt das, was der
Browser aufgenommen hat (webm/opus, mp4, ogg -- je nach Browser etwas
anderes), auf die einzige Form, die whisper.cpp liest: 16 kHz, mono, PCM.
Danach ``whisper-cli`` auf die WAV-Datei.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from pathlib import Path

from src.core.logging import get_logger
from src.services.audio.base import (
    Transkript,
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
        """Beides muss da sein -- sonst sagen wir das, statt es zu versuchen."""
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
    ) -> Transkript:
        """Rohe Aufnahme rein, Text raus.

        ``mime`` und ``filename`` nimmt dieser Weg nur entgegen, um
        denselben Vertrag zu erfuellen wie der Dienst von OpenAI -- ffmpeg
        erkennt den Container selbst und braucht den Hinweis nicht.

        ``language`` ist optional und normalerweise ueberfluessig: ohne
        Angabe erkennt Whisper selbst. Gesetzt wird es nur, wenn jemand
        sicher weiss, was kommt -- das spart einen Erkennungsschritt.
        """
        if not audio:
            raise TranscriptionError("The recording is empty.")
        if len(audio) > self._max_bytes:
            raise TranscriptionError(
                f"The recording is larger than {self._max_bytes // 1_000_000} MB."
            )
        if (grund := self.why_unavailable()) is not None:
            raise TranscriptionError(grund)

        with tempfile.TemporaryDirectory(prefix="smeeware-stt-") as ordner:
            basis = Path(ordner)
            roh = basis / "input"
            wav = basis / "audio.wav"
            roh.write_bytes(audio)

            await self._ffmpeg_nach_wav(roh, wav)
            return await self._whisper(wav, language)

    async def _ffmpeg_nach_wav(self, quelle: Path, ziel: Path) -> None:
        code, _, fehler = await self._lauf(
            self._ffmpeg,
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(quelle),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            "-y",
            str(ziel),
        )
        if code != 0 or not ziel.is_file():
            logger.warning("ffmpeg failed: %s", fehler[-400:])
            raise TranscriptionError("The recording could not be decoded.")

    async def _whisper(self, wav: Path, language: str | None) -> Transkript:
        ausgabe = wav.with_suffix("")
        argumente = [
            self._binary,
            "-m",
            str(self._model),
            "-f",
            str(wav),
            "-l",
            language or "auto",
            "-oj",
            "-of",
            str(ausgabe),
            "--no-prints",
        ]
        if self._threads > 0:
            argumente += ["-t", str(self._threads)]

        code, _, fehler = await self._lauf(*argumente)
        json_datei = ausgabe.with_suffix(".json")
        if code != 0 or not json_datei.is_file():
            logger.warning("whisper failed: %s", fehler[-400:])
            raise TranscriptionError("Transcription failed.")

        return _aus_json(json.loads(json_datei.read_text(encoding="utf-8")))

    async def _lauf(self, *argumente: str) -> tuple[int, str, str]:
        prozess = await asyncio.create_subprocess_exec(
            *argumente,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            aus, fehler = await asyncio.wait_for(
                prozess.communicate(), timeout=self._timeout
            )
        except TimeoutError:
            prozess.kill()
            await prozess.wait()
            raise TranscriptionError(
                f"Transcription took longer than {int(self._timeout)}s."
            ) from None

        return (
            prozess.returncode or 0,
            aus.decode("utf-8", "replace"),
            fehler.decode("utf-8", "replace"),
        )


def _aus_json(nutzlast: dict) -> Transkript:
    """whisper.cpp legt den Text in Abschnitte -- wir wollen einen Fluss."""
    stuecke = [
        str(eintrag.get("text", "")) for eintrag in nutzlast.get("transcription", [])
    ]
    text = " ".join(teil.strip() for teil in stuecke if teil.strip())

    ergebnis = nutzlast.get("result") or {}
    sprache = ergebnis.get("language")

    dauer = 0
    for eintrag in reversed(nutzlast.get("transcription", [])):
        ende = (eintrag.get("offsets") or {}).get("to")
        if isinstance(ende, int):
            dauer = ende
            break

    return Transkript(text=text, language=sprache or None, duration_ms=dauer)
