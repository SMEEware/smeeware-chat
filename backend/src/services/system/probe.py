"""Was die Maschine gerade macht.

Zwei Abnehmer mit sehr verschiedenen Beduerfnissen, und das bestimmt den
Zuschnitt:

Das **Frontend** bekommt alles, strukturiert -- es kostet keine Tokens, ein
Modal darf ruhig zwoelf Zahlen zeigen.

Das **Modell** bekommt eine Handvoll Zeilen. Ihm eine JSON-Wand
hinzustellen waere doppelt teuer: sie kostet Tokens, und dann rechnet es
noch selbst aus, ob 31,2 GB von 38,7 GB viel sind. Deshalb wertet dieses
Modul die Schwellen aus und liefert **Befunde**, keine Rohwerte. Was
unauffaellig ist, wird zu einer Zeile zusammengefasst; was auffaellt, steht
einzeln da.
"""

from __future__ import annotations

import asyncio
import os
import platform
import socket
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import psutil

from src.core.logging import get_logger

logger = get_logger(__name__)

GB = 1_000_000_000

SPEICHER_ENG = 85.0
PLATTE_ENG_PROZENT = 90.0
PLATTE_ENG_FREI_GB = 10.0
LAST_JE_KERN_HOCH = 1.5
SWAP_AUFFAELLIG_GB = 1.0


@dataclass(slots=True)
class Systemdaten:
    zeitpunkt: str
    host: dict[str, Any]
    cpu: dict[str, Any]
    speicher: dict[str, Any]
    platte: dict[str, Any]
    prozess: dict[str, Any]
    dienste: dict[str, Any]
    hinweise: list[str] = field(default_factory=list)

    def als_dict(self) -> dict[str, Any]:
        return asdict(self)

    def kurzfassung(self) -> str:
        """Was das Modell sieht -- dicht, in Zeilen, ohne JSON.

        Bewusst kein Schema: ein Modell liest "Memory 21.0/38.7 GB (54%)"
        schneller und billiger als drei verschachtelte Objekte, und es kann
        genau dasselbe damit anfangen.
        """
        s, p, c = self.speicher, self.platte, self.cpu

        zeilen = [
            f"Host    {self.host['system']} {self.host['release']} "
            f"({self.host['machine']}), up {self.host['uptime']}",
            f"CPU     {c['kerne']} cores, load {c['last']}, {c['auslastung']}% busy",
            f"Memory  {s['benutzt_gb']}/{s['gesamt_gb']} GB ({s['prozent']}%)"
            + (f", swap {s['swap_benutzt_gb']} GB" if s["swap_benutzt_gb"] else ""),
            f"Disk    {p['frei_gb']} GB free of {p['gesamt_gb']} GB ({p['prozent']}% used)",
            f"Backend {self.prozess['rss_mb']} MB RSS, "
            f"{self.prozess['threads']} threads, up {self.prozess['laufzeit']}",
        ]

        if (ollama := self.dienste.get("ollama")) is not None:
            zeilen.append(
                f"Ollama  {ollama['status']}"
                + (f", loaded: {ollama['geladen']}" if ollama.get("geladen") else "")
            )

        if self.hinweise:
            zeilen.append("")
            zeilen.append("Notable:")
            zeilen += [f"- {h}" for h in self.hinweise]
        else:
            zeilen.append("")
            zeilen.append("Nothing notable -- all values are in a normal range.")

        return "\n".join(zeilen)


def _platte() -> tuple[str, Any]:
    """Belegung des Datentraegers, der wirklich zaehlt.

    Auf macOS ist ``/`` seit Catalina die versiegelte, nur lesbare
    System-Volume: ``disk_usage("/")`` meldet dort nur deren ~12 GB und damit
    eine fast leere Platte, obwohl der gemeinsame APFS-Container randvoll ist
    -- der gruene Balken log frueher genau deshalb. Die Nutzdaten und die
    reale Belegung liegen auf dem Data-Volume; wo es das gibt, messen wir
    dort, sonst bleibt es bei ``/``.
    """
    if sys.platform == "darwin":
        try:
            return "/System/Volumes/Data", psutil.disk_usage("/System/Volumes/Data")
        except OSError:
            pass
    return "/", psutil.disk_usage("/")


def _container() -> str | None:
    """Laeuft das Backend in einem Container -- und in was fuer einem?

    Wichtig fuer die Ehrlichkeit des Systemchecks: ``psutil`` liest RAM, Last
    und Uptime aus ``/proc``, und das gehoert dem Host. Die Zahlen stimmen also,
    beschreiben aber die MASCHINE, nicht den Container -- und der Hostname ist
    die Container-ID, nicht der Servername. Ohne diesen Hinweis liest sich das
    Modal wie wirrer Zustand; mit ihm ist klar, was man da sieht.
    """
    if Path("/.dockerenv").exists():
        return "docker"
    if wert := os.getenv("container"):
        return wert
    try:
        cgroup = Path("/proc/1/cgroup").read_text()
    except OSError:
        return None
    for markierung, name in (
        ("kubepods", "kubernetes"),
        ("docker", "docker"),
        ("containerd", "containerd"),
        ("lxc", "lxc"),
    ):
        if markierung in cgroup:
            return name
    return None


def _dauer(sekunden: float) -> str:
    sekunden = int(sekunden)
    tage, rest = divmod(sekunden, 86400)
    stunden, rest = divmod(rest, 3600)
    minuten = rest // 60
    if tage:
        return f"{tage}d {stunden}h"
    if stunden:
        return f"{stunden}h {minuten}m"
    return f"{minuten}m"


class SystemProbe:
    def __init__(self, *, ollama_base_url: str | None = None) -> None:
        self._ollama = ollama_base_url
        self._start = time.time()
        psutil.cpu_percent(interval=None)

    async def messen(self) -> Systemdaten:
        daten = await asyncio.to_thread(self._messen)
        daten.dienste["ollama"] = await self._ollama_status()
        _bewerten(daten)
        return daten

    def _messen(self) -> Systemdaten:
        vm = psutil.virtual_memory()
        swap = psutil.swap_memory()
        platte_pfad, platte = _platte()
        eigen = psutil.Process()

        with eigen.oneshot():
            rss = eigen.memory_info().rss
            threads = eigen.num_threads()
            begonnen = eigen.create_time()

        try:
            last = [round(x, 2) for x in os.getloadavg()]
        except OSError:
            last = []

        kerne = psutil.cpu_count(logical=True) or 1

        return Systemdaten(
            zeitpunkt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            host={
                "hostname": socket.gethostname(),
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
                "python": sys.version.split()[0],
                "uptime": _dauer(time.time() - psutil.boot_time()),
                "uptime_sekunden": int(time.time() - psutil.boot_time()),
                "container": _container(),
            },
            cpu={
                "kerne": kerne,
                "physisch": psutil.cpu_count(logical=False) or kerne,
                "auslastung": round(psutil.cpu_percent(interval=0.15), 1),
                "last": last,
                "last_je_kern": round(last[0] / kerne, 2) if last else None,
            },
            speicher={
                "gesamt_gb": round(vm.total / GB, 1),
                "benutzt_gb": round((vm.total - vm.available) / GB, 1),
                "frei_gb": round(vm.available / GB, 1),
                "prozent": round(vm.percent, 1),
                "swap_gesamt_gb": round(swap.total / GB, 1),
                "swap_benutzt_gb": round(swap.used / GB, 1),
            },
            platte={
                "pfad": platte_pfad,
                "gesamt_gb": round(platte.total / GB, 1),
                "frei_gb": round(platte.free / GB, 1),
                "prozent": round(platte.percent, 1),
            },
            prozess={
                "pid": eigen.pid,
                "rss_mb": round(rss / 1_000_000, 1),
                "threads": threads,
                "laufzeit": _dauer(time.time() - begonnen),
            },
            dienste={},
        )

    async def _ollama_status(self) -> dict[str, Any] | None:
        """Laeuft ein lokales Modell -- und belegt es gerade Speicher?

        Ueber die native Schnittstelle: ``/api/ps`` sagt, was geladen ist.
        Kurzes Zeitlimit, denn ein nicht laufendes Ollama soll den
        Systemcheck nicht aufhalten.
        """
        if not self._ollama:
            return None

        basis = self._ollama.rstrip("/").removesuffix("/v1")
        try:
            import httpx

            async with httpx.AsyncClient(timeout=1.5) as client:
                antwort = await client.get(f"{basis}/api/ps")
            if antwort.status_code != 200:
                return {"status": "reachable, unexpected reply"}

            modelle = antwort.json().get("models") or []
            return {
                "status": "running",
                "geladen": ", ".join(
                    f"{m.get('name')} ({round((m.get('size') or 0) / GB, 1)} GB)"
                    for m in modelle
                )
                or None,
                "anzahl": len(modelle),
            }
        except Exception:  # noqa: BLE001 -- ein Dienst weniger ist kein Fehler
            return {"status": "not reachable"}


def _bewerten(daten: Systemdaten) -> None:
    """Die Schwellen -- einmal hier, statt in jedem Modellaufruf neu."""
    hinweise: list[str] = []

    s, p, c = daten.speicher, daten.platte, daten.cpu

    if s["prozent"] >= SPEICHER_ENG:
        hinweise.append(
            f"Memory is tight: {s['prozent']}% used, only "
            f"{s['frei_gb']} GB available."
        )
    if s["swap_benutzt_gb"] >= SWAP_AUFFAELLIG_GB:
        hinweise.append(
            f"Swap in use ({s['swap_benutzt_gb']} GB) -- the machine is "
            f"paging, which usually shows up as sluggishness."
        )
    if p["prozent"] >= PLATTE_ENG_PROZENT or p["frei_gb"] <= PLATTE_ENG_FREI_GB:
        hinweise.append(
            f"Disk is nearly full: {p['frei_gb']} GB free of {p['gesamt_gb']} GB."
        )
    if c["last_je_kern"] is not None and c["last_je_kern"] >= LAST_JE_KERN_HOCH:
        hinweise.append(
            f"Load is high: {c['last'][0]} across {c['kerne']} cores "
            f"({c['last_je_kern']} per core)."
        )

    if laufzeit := daten.host.get("container"):
        hinweise.append(
            f"Running inside a {laufzeit} container: memory, CPU, load and "
            f"uptime are the host's (shared kernel), and the hostname is the "
            f"container id -- not the server's name."
        )

    daten.hinweise = hinweise
