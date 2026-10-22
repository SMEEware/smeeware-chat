from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from src.services.audio.base import TranscriptionError
from src.services.audio.whisper import WhisperService


class WhisperProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_audio_commands_work_without_asyncio_subprocess_support(self):
        service = WhisperService(binary="unused", model=Path("unused"))
        with patch("asyncio.create_subprocess_exec", side_effect=NotImplementedError):
            result = await service._run(
                sys.executable, "-c",
                "import sys; print('converted'); print('diagnostic', file=sys.stderr); sys.exit(3)",
            )
        self.assertEqual(result[0], 3)
        self.assertEqual(result[1].strip(), "converted")
        self.assertEqual(result[2].strip(), "diagnostic")

    async def test_local_audio_timeout_keeps_its_user_facing_error(self):
        service = WhisperService(binary="unused", model=Path("unused"), timeout=.1)
        with patch("asyncio.create_subprocess_exec", side_effect=NotImplementedError):
            with self.assertRaisesRegex(TranscriptionError, "Transcription took longer than"):
                await service._run(sys.executable, "-c", "import time; time.sleep(30)")
