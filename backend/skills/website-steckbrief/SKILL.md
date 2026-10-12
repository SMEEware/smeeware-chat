---
name: website-steckbrief
description: Aus einer URL einen kompakten Steckbrief bauen (Was, Betreiber, Angebot, Kontakt, Social). Nutze das, wenn jemand "was ist das für eine Seite/Firma" fragt oder einen Überblick zu einer Domain will.
why: Wiederkehrende Recherche-Aufgabe mit fester, guter Reihenfolge der Werkzeuge.
---

# Website-Steckbrief

Ziel: ein knapper, belegter Überblick über eine Seite oder die Firma dahinter.

## Vorgehen

1. `fetch_page` auf die Startseite (mode `article`). Notiere: Was wird angeboten,
   für wen, in welcher Sprache.
2. `list_links` mit `scope=internal` — such nach `impressum`, `about`, `kontakt`,
   `team`, `legal`. `fetch_page` auf den Impressums-/Kontaktlink: Betreiber,
   Rechtsform, Ort, E-Mail.
3. `list_links` mit `scope=external` und `pattern` für soziale Netze
   (`instagram|facebook|linkedin|x\.com|youtube|github`). Gefundene Handles
   mit `social_profile` vertiefen, wenn Followerzahl/Kategorie relevant ist.
4. Ist etwas aktuell zu klären (Preise, News, Status), zusätzlich `web_search`.

## Ausgabe

Ein Steckbrief in dieser Form — nur was belegt ist, keine Vermutungen:

- **Seite:** Name — einzeilige Beschreibung
- **Betreiber:** Firma, Ort (Quelle: Impressum)
- **Angebot:** 2–4 Stichpunkte
- **Kontakt:** E-Mail / Telefon, falls öffentlich
- **Social:** Netzwerk → Handle (Follower, wenn geholt)
- **Quellen:** die genutzten URLs

Fehlt eine Angabe, schreib „nicht gefunden" statt zu raten.
