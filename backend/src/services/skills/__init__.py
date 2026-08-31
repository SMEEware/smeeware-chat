"""Skills -- Arbeitsanweisungen, die das Modell selbst pflegen kann.

Ein Skill ist ein Ordner mit einer ``SKILL.md``: YAML-Frontmatter (name,
description, enabled) plus Anweisungstext, optional dazu Skripte. Das Muster
ist das von Anthropic uebernommene -- so passen Skills aus fremden Sammlungen
1:1 hier hinein.

Zwei Ebenen:

    repo      skills/ im Repo -- vertrauenswuerdig, in git versioniert
    managed   data/skills/ -- lokal, vom Modell geschrieben oder importiert

Progressive disclosure: der Agent sieht immer nur Name + Beschreibung aller
Skills (billig). Passt eine Aufgabe, laedt er ueber ``use_skill`` den vollen
Text nach. Der Index wird zwischengespeichert; ein Schreibvorgang verwirft ihn.
"""

from __future__ import annotations

from src.services.skills.library import Skill, SkillError, SkillLibrary, SkillMeta

__all__ = ["Skill", "SkillError", "SkillLibrary", "SkillMeta"]
