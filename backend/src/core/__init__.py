"""Kernbausteine.

``ServiceProvider`` wird hier bewusst *nicht* re-exportiert: der Container
importiert Services, die ihrerseits ``src.core.exceptions`` brauchen -- ein
Re-Export machte daraus einen Zyklus. Import ihn direkt aus
``src.core.container``.
"""

from src.core.config import Settings, get_settings

__all__ = ["Settings", "get_settings"]
