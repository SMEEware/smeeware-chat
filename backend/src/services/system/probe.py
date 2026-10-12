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

MEMORY_HIGH_PERCENT = 85.0
DISK_HIGH_PERCENT = 90.0
DISK_LOW_FREE_GB = 10.0
LOAD_PER_CORE_HIGH = 1.5
SWAP_NOTABLE_GB = 1.0


@dataclass(slots=True)
class SystemData:
    timestamp: str
    host: dict[str, Any]
    cpu: dict[str, Any]
    memory: dict[str, Any]
    disk: dict[str, Any]
    process: dict[str, Any]
    services: dict[str, Any]
    notices: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    def summary(self) -> str:
        s, p, c = self.memory, self.disk, self.cpu

        lines = [
            f"Host    {self.host['system']} {self.host['release']} "
            f"({self.host['machine']}), up {self.host['uptime']}",
            f"CPU     {c['cores']} cores, load {c['load']}, {c['usage']}% busy",
            f"Memory  {s['used_gb']}/{s['total_gb']} GB ({s['percent']}%)"
            + (f", swap {s['swap_used_gb']} GB" if s["swap_used_gb"] else ""),
            f"Disk    {p['free_gb']} GB free of {p['total_gb']} GB ({p['percent']}% used)",
            f"Backend {self.process['rss_mb']} MB RSS, "
            f"{self.process['threads']} threads, up {self.process['uptime']}",
        ]

        if (ollama := self.services.get("ollama")) is not None:
            lines.append(
                f"Ollama  {ollama['status']}"
                + (f", loaded: {ollama['loaded']}" if ollama.get("loaded") else "")
            )

        if self.notices:
            lines.append("")
            lines.append("Notable:")
            lines += [f"- {h}" for h in self.notices]
        else:
            lines.append("")
            lines.append("Nothing notable -- all values are in a normal range.")

        return "\n".join(lines)


def _disk() -> tuple[str, Any]:
    if sys.platform == "darwin":
        try:
            return "/System/Volumes/Data", psutil.disk_usage("/System/Volumes/Data")
        except OSError:
            pass
    return "/", psutil.disk_usage("/")


def _container() -> str | None:
    if Path("/.dockerenv").exists():
        return "docker"
    if value := os.getenv("container"):
        return value
    try:
        cgroup = Path("/proc/1/cgroup").read_text()
    except OSError:
        return None
    for marking, name in (
        ("kubepods", "kubernetes"),
        ("docker", "docker"),
        ("containerd", "containerd"),
        ("lxc", "lxc"),
    ):
        if marking in cgroup:
            return name
    return None


def _duration(seconds: float) -> str:
    seconds = int(seconds)
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


class SystemProbe:
    def __init__(self, *, ollama_base_url: str | None = None) -> None:
        self._ollama = ollama_base_url
        self._start = time.time()
        psutil.cpu_percent(interval=None)

    async def measure(self) -> SystemData:
        data = await asyncio.to_thread(self._measure)
        data.services["ollama"] = await self._ollama_status()
        _evaluate(data)
        return data

    def _measure(self) -> SystemData:
        vm = psutil.virtual_memory()
        swap = psutil.swap_memory()
        disk_path, disk = _disk()
        own_host = psutil.Process()

        with own_host.oneshot():
            rss = own_host.memory_info().rss
            threads = own_host.num_threads()
            started_at = own_host.create_time()

        try:
            load = [round(x, 2) for x in os.getloadavg()]
        except OSError:
            load = []

        cores = psutil.cpu_count(logical=True) or 1

        return SystemData(
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            host={
                "hostname": socket.gethostname(),
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
                "python": sys.version.split()[0],
                "uptime": _duration(time.time() - psutil.boot_time()),
                "uptime_seconds": int(time.time() - psutil.boot_time()),
                "container": _container(),
            },
            cpu={
                "cores": cores,
                "physical": psutil.cpu_count(logical=False) or cores,
                "usage": round(psutil.cpu_percent(interval=0.15), 1),
                "load": load,
                "load_per_core": round(load[0] / cores, 2) if load else None,
            },
            memory={
                "total_gb": round(vm.total / GB, 1),
                "used_gb": round((vm.total - vm.available) / GB, 1),
                "free_gb": round(vm.available / GB, 1),
                "percent": round(vm.percent, 1),
                "swap_total_gb": round(swap.total / GB, 1),
                "swap_used_gb": round(swap.used / GB, 1),
            },
            disk={
                "path": disk_path,
                "total_gb": round(disk.total / GB, 1),
                "free_gb": round(disk.free / GB, 1),
                "percent": round(disk.percent, 1),
            },
            process={
                "pid": own_host.pid,
                "rss_mb": round(rss / 1_000_000, 1),
                "threads": threads,
                "uptime": _duration(time.time() - started_at),
            },
            services={},
        )

    async def _ollama_status(self) -> dict[str, Any] | None:
        if not self._ollama:
            return None

        basis = self._ollama.rstrip("/").removesuffix("/v1")
        try:
            import httpx

            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{basis}/api/ps")
            if response.status_code != 200:
                return {"status": "reachable, unexpected reply"}

            models = response.json().get("models") or []
            return {
                "status": "running",
                "loaded": ", ".join(
                    f"{m.get('name')} ({round((m.get('size') or 0) / GB, 1)} GB)"
                    for m in models
                )
                or None,
                "count": len(models),
            }
        except Exception:  # noqa: BLE001
            return {"status": "not reachable"}


def _evaluate(data: SystemData) -> None:
    notices: list[str] = []

    s, p, c = data.memory, data.disk, data.cpu

    if s["percent"] >= MEMORY_HIGH_PERCENT:
        notices.append(
            f"Memory is tight: {s['percent']}% used, only "
            f"{s['free_gb']} GB available."
        )
    if s["swap_used_gb"] >= SWAP_NOTABLE_GB:
        notices.append(
            f"Swap in use ({s['swap_used_gb']} GB) -- the machine is "
            f"paging, which usually shows up as sluggishness."
        )
    if p["percent"] >= DISK_HIGH_PERCENT or p["free_gb"] <= DISK_LOW_FREE_GB:
        notices.append(
            f"Disk is nearly full: {p['free_gb']} GB free of {p['total_gb']} GB."
        )
    if c["load_per_core"] is not None and c["load_per_core"] >= LOAD_PER_CORE_HIGH:
        notices.append(
            f"Load is high: {c['load'][0]} across {c['cores']} cores "
            f"({c['load_per_core']} per core)."
        )

    if uptime := data.host.get("container"):
        notices.append(
            f"Running inside a {uptime} container: memory, CPU, load and "
            f"uptime are the host's (shared kernel), and the hostname is the "
            f"container id -- not the server's name."
        )

    data.notices = notices
