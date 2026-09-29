"""Die Stimme fuers Telefonat -- neuronal, gratis, ohne Kontingent.

Nutzt die Vorlese-Stimmen, mit denen auch der Edge-Browser Texte vorliest
(ueber das Paket ``edge-tts``, LGPLv3). Kein Schluessel, keine Kosten, kein
Tageslimit -- und deutlich natuerlicher als die Google-Uebersetzer-Stimme
des bisherigen Gratis-Rueckfalls.

Die "Multilingual"-Stimmen sprechen jede Sprache mit derselben Stimme: ein
Satz Deutsch, ein Satz Englisch, ohne umzuschalten. Deshalb sind sie die
Vorgabe.

Ehrlich dazu: das ist kein offizieller Microsoft-Dienst mit Vertrag, sondern
der Endpunkt hinter "Laut vorlesen" im Browser. Faellt er aus, spricht das
Frontend mit der Stimme des Browsers weiter.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

from src.core.logging import get_logger
from src.services.speech.base import SpeechError

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Stimme:
    id: str
    name: str
    beschreibung: str
    sprache: str


# Eine kuratierte Auswahl statt aller 400 -- und zugleich die Liste dessen,
# was ueberhaupt angefragt werden darf: der Endpunkt reicht keine beliebigen
# Zeichenketten an den Dienst weiter.
STIMMEN: tuple[Stimme, ...] = (
    Stimme("de-DE-SeraphinaMultilingualNeural", "Seraphina", "Warm, speaks every language", "de"),
    Stimme("de-DE-FlorianMultilingualNeural", "Florian", "Calm, speaks every language", "de"),
    Stimme("en-US-AvaMultilingualNeural", "Ava", "Bright, speaks every language", "en"),
    Stimme("en-US-AndrewMultilingualNeural", "Andrew", "Relaxed, speaks every language", "en"),
    Stimme("de-DE-KatjaNeural", "Katja", "Clear German", "de"),
    Stimme("de-DE-ConradNeural", "Conrad", "Deep German", "de"),
)
STANDARD = STIMMEN[0].id
_ERLAUBT = {s.id for s in STIMMEN}

MAX_ZEICHEN = 2_000


async def sprechen(text: str, *, stimme: str | None = None, tempo: int = 0) -> AsyncIterator[bytes]:
    """Text als MP3-Strom -- die ersten Bytes kommen, waehrend der Rest noch
    erzeugt wird.

    ``tempo`` in Prozent (-30..30): am Telefon wirkt ein Hauch schneller
    lebendiger als das Vorlese-Tempo.
    """
    text = " ".join((text or "").split())
    if not text:
        raise SpeechError("Nothing to speak.")
    if len(text) > MAX_ZEICHEN:
        text = text[:MAX_ZEICHEN]

    # Erst hier importiert, nicht oben in der Datei: fehlt das Paket (Server
    # nach einem Pull, ohne neu zu installieren), soll nur das Telefonat auf
    # die Browser-Stimme ausweichen -- nicht das ganze Backend beim Start
    # abstuerzen, weil der Router dieses Modul laedt.
    try:
        import edge_tts
    except ImportError as exc:
        logger.error("Paket 'edge-tts' fehlt -- pip install -r requirements.txt")
        raise SpeechError(
            "The call voice needs the 'edge-tts' package "
            "(pip install -r requirements.txt)."
        ) from exc

    wahl = stimme if stimme in _ERLAUBT else STANDARD
    tempo = max(-30, min(30, int(tempo)))
    kommunikation = edge_tts.Communicate(text, wahl, rate=f"{tempo:+d}%")

    try:
        async for stueck in kommunikation.stream():
            if stueck["type"] == "audio" and stueck.get("data"):
                yield stueck["data"]
    except Exception as exc:  # noqa: BLE001 -- der Dienst meldet vieles
        logger.warning("Neuronale Stimme gescheitert: %s", exc)
        raise SpeechError(f"The voice service failed: {exc}") from exc
